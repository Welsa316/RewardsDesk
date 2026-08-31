// Stripe webhook — the primary source of payment truth for parking.
// Mounted with express.raw (see index.js): signature verification needs the
// unparsed body. The signature IS the authentication.
//
// The activation logic lives in lib/parkingActivation.js because the guest
// status endpoint also reconciles directly with Stripe when a webhook is
// delayed or undeliverable. Both paths share the same idempotency gate.
import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { getStripe, stripeEnabled } from '../lib/stripe.js';
import { applyCompletedCheckout, cancelExpiredCheckout } from '../lib/parkingActivation.js';

const router = Router();

// Reconciliation: refunds issued in the Stripe dashboard (or by us) land as
// audit rows exactly once — stripe_refund_id is UNIQUE.
//
// The split matters as much as the total. Inserting a refund with NULL
// subtotal/tax does not read as "unknown" in the reports — SUM() skips NULLs,
// so a fully refunded $7.80 charge showed net paid $0 while the CSV still
// claimed $1.30 of tax collected. Every refund row carries its own split,
// prorated against what is still unrefunded, exactly as the admin path does.
async function handleChargeRefunded(charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, session_id, amount_cents, tax_cents FROM parking_payments
        WHERE stripe_payment_intent_id = $1 AND type='charge'
        ORDER BY id LIMIT 1
        FOR UPDATE`,
      [piId],
    );
    const original = rows[0];
    if (!original) return;

    for (const refund of charge.refunds?.data ?? []) {
      // Recomputed inside the loop: each row we insert changes the remaining
      // balance the next one prorates against, which is what makes the parts
      // sum back to the whole however many refunds the charge collects.
      const { rows: sumRows } = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS refunded,
                COALESCE(SUM(tax_cents), 0)::int    AS tax_refunded
           FROM parking_payments
          WHERE refunded_payment_id = $1 AND type='refund'
            AND status IN ('succeeded','pending')`,
        [original.id],
      );
      const remainingTotal = (original.amount_cents || 0) - sumRows[0].refunded;
      const remainingTax = Math.max(0, (original.tax_cents ?? 0) - sumRows[0].tax_refunded);
      const refundTax =
        remainingTotal > 0
          ? Math.min(remainingTax, Math.round((refund.amount * remainingTax) / remainingTotal))
          : 0;

      await client.query(
        `INSERT INTO parking_payments
           (session_id, type, purpose, method, amount_cents, subtotal_cents, tax_cents,
            status, stripe_refund_id, stripe_payment_intent_id, refunded_payment_id, note)
         VALUES ($1,'refund','refund','stripe',$2,$3,$4,$5,$6,$7,$8,'Synced from Stripe')
         ON CONFLICT (stripe_refund_id) DO NOTHING`,
        [
          original.session_id, refund.amount, refund.amount - refundTax, refundTax,
          refund.status === 'succeeded' ? 'succeeded' : 'pending',
          refund.id, piId, original.id,
        ],
      );
    }
  });
}

// A refund can settle or fail long after it was created. Without these the
// ledger keeps a failed refund booked as money returned — deducted from
// revenue, and already announced to the guest.
async function handleRefundUpdated(refund) {
  if (!refund?.id) return;
  const status =
    refund.status === 'succeeded' || refund.status === 'failed' || refund.status === 'canceled'
      ? refund.status
      : 'pending';
  const { rowCount } = await query(
    `UPDATE parking_payments SET status=$1, updated_at=now()
      WHERE stripe_refund_id=$2 AND status <> $1`,
    [status, refund.id],
  );
  if (rowCount && status !== 'succeeded') {
    console.error(`⚠ parking: refund ${refund.id} came back '${status}' — revenue figures corrected.`);
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
        await applyCompletedCheckout(event.data.object);
        break;
      case 'checkout.session.expired':
        await cancelExpiredCheckout(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      case 'refund.updated':
      case 'refund.failed':
        await handleRefundUpdated(event.data.object);
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
