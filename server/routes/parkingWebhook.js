// Stripe webhook — the single source of payment truth for parking.
// Mounted with express.raw (see index.js): signature verification needs the
// unparsed body. The signature IS the authentication.
import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { getStripe, stripeEnabled } from '../lib/stripe.js';
import { durationHours } from '../lib/parking.js';

const router = Router();

async function handleCheckoutCompleted(cs) {
  // Fetch the receipt BEFORE the transaction — no network call inside it.
  let receiptUrl = null;
  const piId = typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id;
  if (piId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
      receiptUrl = pi.latest_charge?.receipt_url || null;
    } catch {
      // receipt is a nicety; never block activation on it
    }
  }

  await withTransaction(async (client) => {
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
    // Idempotency gate: only a pending payment can transition. Stripe retries
    // and CLI replays hit this and no-op.
    if (!payment || payment.status !== 'pending') return;

    if (Number.isInteger(cs.amount_total) && cs.amount_total !== payment.amount_cents) {
      console.warn(
        `⚠ parking webhook: amount mismatch on payment ${payment.id} — ours ${payment.amount_cents}, Stripe ${cs.amount_total}`,
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
  });
}

async function handleCheckoutExpired(cs) {
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

// Reconciliation: refunds made in the Stripe dashboard (or by us) land as
// audit rows exactly once — stripe_refund_id is UNIQUE.
async function handleChargeRefunded(charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const { rows } = await query(
    `SELECT id, session_id FROM parking_payments
      WHERE stripe_payment_intent_id = $1 AND type='charge' LIMIT 1`,
    [piId],
  );
  const original = rows[0];
  if (!original) return;

  for (const refund of charge.refunds?.data ?? []) {
    await query(
      `INSERT INTO parking_payments
         (session_id, type, purpose, method, amount_cents, status, stripe_refund_id,
          stripe_payment_intent_id, note)
       VALUES ($1,'refund','refund','stripe',$2,'succeeded',$3,$4,'Synced from Stripe')
       ON CONFLICT (stripe_refund_id) DO NOTHING`,
      [original.session_id, refund.amount, refund.id, piId],
    );
  }
}

router.post('/', async (req, res) => {
  if (!stripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Payments are not configured.' });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body, // raw Buffer — do NOT json-parse before this
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      default:
        break; // unhandled types are fine — 200 so Stripe stops retrying
    }
    res.json({ received: true });
  } catch (err) {
    console.error('parking webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handling failed' }); // Stripe retries
  }
});

export default router;
