// Applying a completed Stripe Checkout to a parking session.
//
// Two things call this: the webhook (normal path) and the guest status
// endpoint's reconciliation (fallback when a webhook is delayed, missed, or —
// in local development — cannot be delivered at all without the Stripe CLI).
// Both routes are safe because activation is gated on the payment row still
// being 'pending', so it can only ever happen once.
import { query, withTransaction } from '../db/index.js';
import { getStripe, stripeEnabled, publicBaseUrl } from './stripe.js';
import { sendParkingReceipt } from './email.js';
import { durationHours } from './parking.js';

// `cs` is a Stripe Checkout Session (from a webhook event or a direct retrieve).
export async function applyCompletedCheckout(cs) {
  // Set inside the transaction, used after it commits to send the receipt.
  let activated = null;

  // Fetch the receipt BEFORE the transaction — no network call inside it.
  let receiptUrl = null;
  const piId = typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id;
  if (piId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
      receiptUrl = pi.latest_charge?.receipt_url || null;
    } catch {
      // A receipt is a nicety; never block activation on it.
    }
  }

  const applied = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT p.id, p.session_id, p.purpose, p.status, p.amount_cents, p.rate_type, p.quantity,
              s.disposition
         FROM parking_payments p
         JOIN parking_sessions s ON s.id = p.session_id
        WHERE p.stripe_checkout_session_id = $1
          FOR UPDATE OF p`,
      [cs.id],
    );
    let payment = rows[0];
    if (!payment && cs.metadata?.payment_id) {
      const fallback = await client.query(
        `SELECT p.id, p.session_id, p.purpose, p.status, p.amount_cents, p.rate_type, p.quantity,
                s.disposition
           FROM parking_payments p
           JOIN parking_sessions s ON s.id = p.session_id
          WHERE p.id = $1
            FOR UPDATE OF p`,
        [parseInt(cs.metadata.payment_id, 10)],
      );
      payment = fallback.rows[0];
    }
    // Idempotency gate: only a pending payment transitions. Webhook retries,
    // CLI replays, and reconciliation all land here and no-op.
    if (!payment || payment.status !== 'pending') return false;

    if (Number.isInteger(cs.amount_total) && cs.amount_total !== payment.amount_cents) {
      console.warn(
        `⚠ parking: amount mismatch on payment ${payment.id} — ours ${payment.amount_cents}, Stripe ${cs.amount_total}`,
      );
    }

    await client.query(
      `UPDATE parking_payments
          SET status='succeeded', stripe_payment_intent_id=$1, receipt_url=$2, updated_at=now()
        WHERE id=$3`,
      [piId || null, receiptUrl, payment.id],
    );

    const hours = durationHours(payment.rate_type, payment.quantity);
    if (payment.purpose === 'initial' && payment.disposition === 'pending_payment') {
      // The one and only pending -> active transition.
      await client.query(
        `UPDATE parking_sessions
            SET disposition='active', starts_at=now(),
                paid_through=now() + make_interval(hours => $1), updated_at=now()
          WHERE id=$2`,
        [hours, payment.session_id],
      );
    } else if (payment.purpose === 'extension') {
      // Never bill dead time; never shorten an active session.
      await client.query(
        `UPDATE parking_sessions
            SET paid_through = GREATEST(paid_through, now()) + make_interval(hours => $1),
                updated_at=now()
          WHERE id=$2`,
        [hours, payment.session_id],
      );
    }
    activated = { sessionId: payment.session_id, amountCents: payment.amount_cents };
    return true;
  });

  // After the commit, so the receipt reflects the stored paid_through — and so
  // a mail failure can never roll back a payment that has already succeeded.
  // Not awaited: the webhook must answer Stripe promptly.
  if (applied && activated) {
    sendReceiptForSession(activated.sessionId, activated.amountCents);
  }
  return applied;
}

/**
 * Emails the driver their receipt after a successful activation.
 * Called outside the activation transaction and never awaited into it — the
 * money has moved and the session is active regardless of what mail does.
 */
export async function sendReceiptForSession(sessionId, amountCents) {
  try {
    const { rows } = await query(
      `SELECT ps.email, ps.confirmation_code, ps.plate, ps.plate_state, ps.starts_at,
              ps.paid_through, ps.status_token,
              COALESCE(NULLIF(s.parking_brand_name, ''), 'Guest Parking') AS brand_name,
              s.timezone
         FROM parking_sessions ps CROSS JOIN settings s
        WHERE ps.id = $1 AND s.id = 1`,
      [sessionId],
    );
    const r = rows[0];
    if (!r?.email) return false; // email is optional on the parking form
    return await sendParkingReceipt({
      to: r.email,
      brandName: r.brand_name,
      confirmationCode: r.confirmation_code,
      plate: r.plate,
      plateState: r.plate_state,
      amountCents,
      startsAt: r.starts_at,
      paidThrough: r.paid_through,
      statusUrl: `${publicBaseUrl()}/park/s/${r.status_token}`,
      timeZone: r.timezone,
    });
  } catch (err) {
    console.error('  ✉ receipt lookup failed:', err?.message || err);
    return false;
  }
}

export async function cancelExpiredCheckout(cs) {
  const { rows } = await query(
    `UPDATE parking_payments SET status='canceled', updated_at=now()
      WHERE stripe_checkout_session_id=$1 AND status='pending'
      RETURNING session_id, purpose`,
    [cs.id],
  );
  const payment = rows[0];
  if (payment?.purpose === 'initial') {
    await query(
      `UPDATE parking_sessions SET disposition='canceled', updated_at=now()
        WHERE id=$1 AND disposition='pending_payment'`,
      [payment.session_id],
    );
  }
}

// Ask Stripe directly about any still-pending checkouts on a session and apply
// the result. Used by the guest status page so a guest is never stranded on
// "Confirming payment…" because a webhook was missed or undeliverable.
// Best-effort: any failure is swallowed, since the webhook remains the
// primary path and the caller must still return the session state.
export async function reconcilePendingCheckouts(sessionId) {
  if (!stripeEnabled()) return false;
  try {
    const { rows } = await query(
      `SELECT stripe_checkout_session_id
         FROM parking_payments
        WHERE session_id = $1 AND status = 'pending'
          AND stripe_checkout_session_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 3`,
      [sessionId],
    );
    if (!rows.length) return false;

    let changed = false;
    for (const row of rows) {
      const cs = await getStripe().checkout.sessions.retrieve(row.stripe_checkout_session_id);
      if (cs.payment_status === 'paid') {
        changed = (await applyCompletedCheckout(cs)) || changed;
      } else if (cs.status === 'expired') {
        await cancelExpiredCheckout(cs);
        changed = true;
      }
    }
    return changed;
  } catch (err) {
    console.warn('parking reconciliation skipped:', err.message);
    return false;
  }
}
