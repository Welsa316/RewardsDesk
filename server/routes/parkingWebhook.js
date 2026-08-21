// Stripe webhook — the primary source of payment truth for parking.
// Mounted with express.raw (see index.js): signature verification needs the
// unparsed body. The signature IS the authentication.
//
// The activation logic lives in lib/parkingActivation.js because the guest
// status endpoint also reconciles directly with Stripe when a webhook is
// delayed or undeliverable. Both paths share the same idempotency gate.
import { Router } from 'express';
import { query } from '../db/index.js';
import { getStripe, stripeEnabled } from '../lib/stripe.js';
import { applyCompletedCheckout, cancelExpiredCheckout } from '../lib/parkingActivation.js';

const router = Router();

// Reconciliation: refunds issued in the Stripe dashboard (or by us) land as
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
          stripe_payment_intent_id, refunded_payment_id, note)
       VALUES ($1,'refund','refund','stripe',$2,'succeeded',$3,$4,$5,'Synced from Stripe')
       ON CONFLICT (stripe_refund_id) DO NOTHING`,
      [original.session_id, refund.amount, refund.id, piId, original.id],
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
        await applyCompletedCheckout(event.data.object);
        break;
      case 'checkout.session.expired':
        await cancelExpiredCheckout(event.data.object);
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
