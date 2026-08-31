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

    // Nothing is owed until Stripe says the money is actually there. Delayed
    // payment methods complete the Checkout Session first and settle later, so
    // 'completed' alone is not payment — without this a bank debit that never
    // clears still opens the gate.
    if (cs.payment_status && cs.payment_status !== 'paid') return false;

    // Stripe is the authority on what the card was actually charged. Ours is a
    // prediction: it is wrong whenever STRIPE_TAX_RATE_ID and the tax rate in
    // Settings disagree. Warning and then storing our own number put a figure
    // in the ledger and on the guest's receipt that nobody was ever charged,
    // so record what Stripe moved and use its own tax split to divide it.
    let amountCents = payment.amount_cents;
    let subtotalCents = payment.subtotal_cents;
    let taxCents = payment.tax_cents;
    if (Number.isInteger(cs.amount_total) && cs.amount_total !== payment.amount_cents) {
      console.error(
        `⚠ parking: amount mismatch on payment ${payment.id} — ours ${payment.amount_cents}, ` +
          `Stripe ${cs.amount_total}. Recording Stripe's figure. Check STRIPE_TAX_RATE_ID ` +
          `matches the parking tax rate in Settings.`,
      );
      amountCents = cs.amount_total;
      taxCents = Number.isInteger(cs.total_details?.amount_tax)
        ? cs.total_details.amount_tax
        : taxCents;
      subtotalCents = amountCents - (taxCents ?? 0);
    }

    await client.query(
      `UPDATE parking_payments
          SET status='succeeded', stripe_payment_intent_id=$1, receipt_url=$2,
              amount_cents=$3, subtotal_cents=$4, tax_cents=$5, updated_at=now()
        WHERE id=$6`,
      [piId || null, receiptUrl, amountCents, subtotalCents, taxCents, payment.id],
    );

    const hours = durationHours(payment.rate_type, payment.quantity);
    let addedTime = false;

    // A guest who taps Pay, goes back, and pays again has two pending sessions
    // for one car, and both webhooks would activate. The checkout guard cannot
    // close this on its own — it runs before either payment exists. Refusing
    // the second activation here turns a silent double charge into one that is
    // captured, flagged, and refundable, and leaves the guest with the single
    // session they actually need.
    if (payment.purpose === 'initial' && payment.disposition === 'pending_payment') {
      const { rows: liveRows } = await client.query(
        `SELECT 1 FROM parking_sessions
          WHERE plate = (SELECT plate FROM parking_sessions WHERE id = $1)
            AND plate_state IS NOT DISTINCT FROM
                (SELECT plate_state FROM parking_sessions WHERE id = $1)
            AND id <> $1
            AND disposition = 'active'
            AND paid_through > now()
          LIMIT 1`,
        [payment.session_id],
      );
      if (liveRows[0]) {
        console.error(
          `⚠ parking: payment ${payment.id} paid for a plate that already has an active ` +
            `session — session ${payment.session_id} not activated. This needs a refund.`,
        );
        await client.query(
          `UPDATE parking_payments
              SET note = COALESCE(NULLIF(note, '') || ' | ', '') ||
                         'Duplicate payment — this plate was already parked; needs refund'
            WHERE id = $1`,
          [payment.id],
        );
        await client.query(
          `UPDATE parking_sessions SET disposition='canceled', updated_at=now() WHERE id=$1`,
          [payment.session_id],
        );
        return true;
      }
    }

    if (payment.purpose === 'initial' && payment.disposition === 'pending_payment') {
      // The one and only pending -> active transition.
      await client.query(
        `UPDATE parking_sessions
            SET disposition='active', starts_at=now(),
                paid_through=now() + make_interval(hours => $1), updated_at=now()
          WHERE id=$2`,
        [hours, payment.session_id],
      );
      addedTime = true;
    } else if (payment.purpose === 'extension' && payment.disposition === 'active') {
      // Never bill dead time; never shorten an active session. Requiring
      // 'active' is what stops time being added to a vehicle the desk has
      // already checked out, or to a session that was canceled.
      await client.query(
        `UPDATE parking_sessions
            SET paid_through = GREATEST(paid_through, now()) + make_interval(hours => $1),
                updated_at=now()
          WHERE id=$2`,
        [hours, payment.session_id],
      );
      addedTime = true;
    }

    if (!addedTime) {
      // The money moved but the session could not take the time — an extension
      // paid after check-out, or an initial payment on a session that is no
      // longer pending. The ledger must still show the charge, so flag it for
      // staff to refund rather than mailing the guest a receipt that implies
      // they bought something.
      console.error(
        `⚠ parking: payment ${payment.id} (${payment.purpose}) captured on session ` +
          `${payment.session_id} in disposition '${payment.disposition}' — no time added. ` +
          `This needs a refund.`,
      );
      await client.query(
        `UPDATE parking_payments
            SET note = COALESCE(NULLIF(note, '') || ' | ', '') ||
                       'Captured but no time added (session was ' || $1 || ') — needs refund'
          WHERE id = $2`,
        [payment.disposition, payment.id],
      );
      return true;
    }

    activated = { sessionId: payment.session_id, amountCents };
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
