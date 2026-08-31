import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { getStripe, publicBaseUrl, stripeLineAmount } from '../lib/stripe.js';
import {
  priceBreakdown,
  durationHours,
  durationLabel,
  generateConfirmationCode,
  derivedStatusSql,
} from '../lib/parking.js';
import { reconcilePendingCheckouts } from '../lib/parkingActivation.js';
import { activeDailyRate } from '../lib/parkingRates.js';
import { validateParking } from '../middleware/validateParking.js';
import {
  parkingCheckoutPerMinute,
  parkingCheckoutPerHour,
  parkingCheckoutPerHourPerIp,
  parkingExtendPerHour,
  parkingStatusLimiter,
} from '../middleware/rateLimit.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function parkingSettings() {
  const { rows } = await query(
    // Falls back to a neutral label, never the hotel name — that names the
    // chain, and the parking pages are the one surface a guest must not be able
    // to connect back to it. An unset brand shows something plain rather than
    // something wrong.
    `SELECT COALESCE(NULLIF(parking_brand_name, ''), 'Guest Parking') AS brand_name,
            parking_daily_cents, parking_lots,
            parking_expiring_soon_minutes, parking_tax_bps
       FROM settings WHERE id = 1`,
  );
  return rows[0];
}

// Public branding + rates for the guest form. Nothing sensitive, no capacity.
router.get('/public/parking-config', async (req, res, next) => {
  try {
    const s = await parkingSettings();
    const { rateCents, standardCents, promo } = await activeDailyRate(s.parking_daily_cents);
    res.json({
      brand_name: s.brand_name,
      // The effective rate, so the form quotes exactly what will be charged.
      daily_cents: rateCents,
      standard_daily_cents: standardCents,
      promo, // null unless a promo is running; drives the banner
      // The form quotes the full amount up front — a guest who sees $6.50 here
      // and $7.80 on Stripe's page has been surprised at the worst moment.
      tax_bps: s.parking_tax_bps,
      lots: s.parking_lots,
    });
  } catch (err) {
    next(err);
  }
});

// Web app manifest for the guest parking pages. Served dynamically so an
// installed parking app carries the configured parking brand and neutral
// icons — never the hotel's name, the rewards name, or the hotel wordmark.
// The static /manifest.webmanifest is the staff app's and must not be used here.
router.get('/public/parking-manifest', async (req, res, next) => {
  try {
    const s = await parkingSettings();
    res.type('application/manifest+json');
    res.set('Cache-Control', 'no-cache');
    res.json({
      name: s.brand_name,
      short_name: s.brand_name.length > 12 ? 'Parking' : s.brand_name,
      description: 'Pay for parking and check your time.',
      theme_color: '#0F1B2D',
      background_color: '#FBF8F3',
      display: 'standalone',
      start_url: '/park',
      scope: '/park',
      icons: [
        { src: '/icons/parking-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/parking-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/parking-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  } catch (err) {
    next(err);
  }
});

// Insert a session with a fresh confirmation code, retrying on the (rare)
// unique collision.
async function insertSession(client, data, values) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const code = generateConfirmationCode();
      const { rows } = await client.query(data, [code, ...values]);
      return rows[0];
    } catch (err) {
      if (err.code !== '23505' || !String(err.detail || '').includes('confirmation_code')) throw err;
    }
  }
  throw new Error('Could not allocate a confirmation code.');
}

// POST /api/parking/checkout — guest self-serve. Creates a pending session +
// pending initial payment, then a Stripe Checkout Session; guest pays on
// Stripe's hosted page. Only the webhook activates the session.
router.post(
  '/parking/checkout',
  parkingCheckoutPerMinute,
  parkingCheckoutPerHourPerIp,
  parkingCheckoutPerHour,
  validateParking,
  async (req, res, next) => {
    try {
      const c = req.cleanParking;
      const s = await parkingSettings();

      const { rateCents } = await activeDailyRate(s.parking_daily_cents);
      // Tax applies to the rate actually in force, so a promo is never taxed at
      // the standard rate.
      const price = priceBreakdown(
        c.rate_type,
        c.quantity,
        { parking_daily_cents: rateCents },
        s.parking_tax_bps,
      );
      if (price === null) {
        return res.status(422).json({
          error: 'Please fix the highlighted fields.',
          fields: { quantity: 'Choose a valid duration.' },
        });
      }
      const amount = price.total;
      const lot = s.parking_lots.includes(c.lot) ? c.lot : null;

      // Guard against paying twice for the same car. A guest who loses their
      // status link and re-scans the lot sign lands on a blank form; without
      // this they can fill it in again and be charged a second time.
      // The status token is only handed back when the phone matches too — a
      // plate is visible on the car, so plate alone is not proof of ownership
      // (the status page carries the room number).
      // Match on plate + state when both are known, so ABC123 (LA) and
      // ABC123 (TX) are different cars. Rows recorded before plate_state
      // existed have NULL and still match on the plate alone.
      const { rows: dupRows } = await query(
        `SELECT status_token, paid_through, phone
           FROM parking_sessions
          WHERE plate = $1
            AND (plate_state IS NULL OR $2::char(2) IS NULL OR plate_state = $2)
            AND disposition = 'active' AND paid_through > now()
          ORDER BY paid_through DESC LIMIT 1`,
        [c.plate, c.plate_state],
      );
      if (dupRows[0]) {
        const dup = dupRows[0];
        // Compare digits, not strings. "504-360-2990" and "5043602990" are the
        // same person, and an exact compare told them to see the front desk
        // about their own car.
        const digits = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);
        const samePhone =
          digits(dup.phone).length === 10 && digits(dup.phone) === digits(c.phone);
        // Plates are readable from the kerb. Answering "yes, parked, until
        // 4pm" to anyone who types one turns the payment form into an
        // occupancy lookup for the whole lot, so the time — like the status
        // token — is only for someone who can produce the matching phone.
        return res.status(409).json({
          error: samePhone
            ? `${c.plate} is already parked here until ${new Date(dup.paid_through).toISOString()}. You don't need to pay again.`
            : `${c.plate} is already covered. If this is your vehicle, open the link from your payment confirmation, or see the front desk.`,
          already_parked: true,
          paid_through: samePhone ? dup.paid_through : undefined,
          status_token: samePhone ? dup.status_token : undefined,
        });
      }

      // Same plate, payment already in flight. Without this the guest who taps
      // Pay, goes back, and taps Pay again gets a second Checkout Session, and
      // completing both charges them twice for one car. Hand back the checkout
      // they already have instead of opening another.
      const { rows: openRows } = await query(
        `SELECT p.stripe_checkout_session_id
           FROM parking_sessions ps
           JOIN parking_payments p ON p.session_id = ps.id
          WHERE ps.plate = $1
            AND (ps.plate_state IS NULL OR $2::char(2) IS NULL OR ps.plate_state = $2)
            AND ps.disposition = 'pending_payment'
            AND ps.created_at > now() - interval '1 hour'
            AND p.purpose = 'initial' AND p.status = 'pending'
            AND p.stripe_checkout_session_id IS NOT NULL
          ORDER BY p.created_at DESC LIMIT 1`,
        [c.plate, c.plate_state],
      );
      if (openRows[0]) {
        try {
          const open = await getStripe().checkout.sessions.retrieve(
            openRows[0].stripe_checkout_session_id,
          );
          if (open.status === 'open' && open.url) {
            return res.status(200).json({ checkout_url: open.url });
          }
        } catch {
          // Stripe unreachable or the session is gone — fall through and make
          // a new one rather than blocking a guest from paying.
        }
      }

      // Rows first (committed), then the Stripe network call — a failed call
      // marks the rows failed/canceled rather than holding a transaction open.
      const created = await withTransaction(async (client) => {
        const session = await insertSession(
          client,
          `INSERT INTO parking_sessions
             (confirmation_code, guest_name, phone, email, plate, plate_state, vehicle_desc, room, lot,
              kind, rate_type, quantity, disposition)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'online',$10,$11,'pending_payment')
           RETURNING id, status_token, confirmation_code`,
          [c.guest_name, c.phone, c.email, c.plate, c.plate_state, c.vehicle_desc, c.room, lot, c.rate_type, c.quantity],
        );
        const { rows: payRows } = await client.query(
          `INSERT INTO parking_payments
             (session_id, type, purpose, method, amount_cents, subtotal_cents, tax_cents,
              rate_type, quantity, status)
           VALUES ($1,'charge','initial','stripe',$2,$3,$4,$5,$6,'pending')
           RETURNING id`,
          [session.id, price.total, price.subtotal, price.tax, c.rate_type, c.quantity],
        );
        return { session, paymentId: payRows[0].id };
      });

      const base = publicBaseUrl();
      const line = stripeLineAmount(price);
      let checkout;
      try {
        checkout = await getStripe().checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: line.unitAmount,
                product_data: {
                  name: `${s.brand_name} — Guest parking, ${durationLabel(c.rate_type, c.quantity)} (${c.plate})`,
                },
              },
              ...(line.taxRates ? { tax_rates: line.taxRates } : {}),
            },
          ],
          metadata: {
            parking_session_id: String(created.session.id),
            payment_id: String(created.paymentId),
          },
          customer_email: c.email || undefined,
          success_url: `${base}/park/s/${created.session.status_token}?paid=1`,
          cancel_url: `${base}/park?canceled=1${lot ? `&src=${encodeURIComponent(lot)}` : ''}`,
          // Quick reaping of abandoned checkouts via checkout.session.expired.
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // Stripe requires >= 30 min; 60 leaves headroom for latency/clock skew
        });
      } catch (err) {
        await query(
          `UPDATE parking_payments SET status='failed', updated_at=now() WHERE id=$1`,
          [created.paymentId],
        );
        await query(
          `UPDATE parking_sessions SET disposition='canceled', updated_at=now()
            WHERE id=$1 AND disposition='pending_payment'`,
          [created.session.id],
        );
        throw err;
      }

      await query(
        `UPDATE parking_payments SET stripe_checkout_session_id=$1, updated_at=now() WHERE id=$2`,
        [checkout.id, created.paymentId],
      );

      res.status(201).json({ checkout_url: checkout.url, status_token: created.session.status_token });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/parking/session/:token — guest status page data. Returns only what
// the guest needs; never echoes phone/email back.
router.get('/parking/session/:token', parkingStatusLimiter, async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!UUID_RE.test(token)) return res.status(404).json({ error: 'Not found' });

    const s = await parkingSettings();
    const statusSql = derivedStatusSql('ps', s.parking_expiring_soon_minutes);
    const selectSession = `SELECT ps.id, ps.confirmation_code, ps.plate, ps.plate_state, ps.room, ps.kind, ps.rate_type,
              ps.starts_at, ps.paid_through, ${statusSql} AS status
         FROM parking_sessions ps
        WHERE ps.status_token = $1`;

    let { rows } = await query(selectSession, [token]);
    let session = rows[0];
    if (!session) return res.status(404).json({ error: 'Not found' });

    // Ask Stripe directly about any outstanding checkout rather than waiting on
    // a webhook that may be delayed or (in local dev) undeliverable. This must
    // cover EXTENSIONS too — those happen on an already-active session, so
    // gating on the session being unpaid would leave a guest who paid to extend
    // with no extra time. reconcilePendingCheckouts early-returns (one indexed
    // query, no Stripe call) when nothing is pending, and is idempotent.
    const changed = await reconcilePendingCheckouts(session.id);
    if (changed) {
      ({ rows } = await query(selectSession, [token]));
      session = rows[0];
    }

    const { rows: payRows } = await query(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE type='charge' AND status='succeeded'), 0)::int
              - COALESCE(SUM(amount_cents) FILTER (WHERE type='refund' AND status='succeeded'), 0)::int
              AS net_paid_cents,
              (SELECT receipt_url FROM parking_payments
                WHERE session_id = $1 AND status='succeeded' AND receipt_url IS NOT NULL
                ORDER BY created_at DESC LIMIT 1) AS receipt_url
         FROM parking_payments WHERE session_id = $1`,
      [session.id],
    );

    res.json({
      brand_name: s.brand_name,
      confirmation_code: session.confirmation_code,
      plate: session.plate,
      plate_state: session.plate_state,
      room: session.room,
      kind: session.kind,
      status: session.status,
      starts_at: session.starts_at,
      paid_through: session.paid_through,
      server_now: new Date().toISOString(), // lets the countdown ignore client clock skew
      net_paid_cents: payRows[0].net_paid_cents,
      receipt_url: payRows[0].receipt_url,
      // tax_bps travels with the rate so the extend picker quotes the same
      // total the payment page does. Without it the guest picked "2 more days",
      // saw a pre-tax figure, and Stripe charged more.
      rates: { daily_cents: (await activeDailyRate(s.parking_daily_cents)).rateCents },
      tax_bps: s.parking_tax_bps || 0,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/session/:token/extend — guest self-serve extension.
router.post(
  '/parking/session/:token/extend',
  parkingCheckoutPerMinute,
  parkingCheckoutPerHourPerIp,
  parkingExtendPerHour,
  async (req, res, next) => {
    try {
      const token = req.params.token;
      if (!UUID_RE.test(token)) return res.status(404).json({ error: 'Not found' });

      const rate_type = req.body?.rate_type === 'daily' ? 'daily' : null;
      const quantity = Number(req.body?.quantity);
      const s = await parkingSettings();
      const { rateCents } = await activeDailyRate(s.parking_daily_cents);
      const price = rate_type
        ? priceBreakdown(rate_type, quantity, { parking_daily_cents: rateCents }, s.parking_tax_bps)
        : null;
      if (price === null) {
        return res.status(422).json({ error: 'Choose a valid extension duration.' });
      }

      const { rows } = await query(
        `SELECT id, plate, email, disposition FROM parking_sessions WHERE status_token = $1`,
        [token],
      );
      const session = rows[0];
      if (!session) return res.status(404).json({ error: 'Not found' });
      if (session.disposition !== 'active') {
        return res.status(422).json({ error: 'This parking session can no longer be extended.' });
      }

      // A double-submit here bought the same day twice. An extension already in
      // flight for this session, for the same duration, is the same purchase —
      // send the guest back to the checkout they already opened.
      const { rows: openRows } = await query(
        `SELECT stripe_checkout_session_id
           FROM parking_payments
          WHERE session_id = $1 AND purpose = 'extension' AND status = 'pending'
            AND rate_type = $2 AND quantity = $3
            AND stripe_checkout_session_id IS NOT NULL
            AND created_at > now() - interval '1 hour'
          ORDER BY created_at DESC LIMIT 1`,
        [session.id, rate_type, quantity],
      );
      if (openRows[0]) {
        try {
          const open = await getStripe().checkout.sessions.retrieve(
            openRows[0].stripe_checkout_session_id,
          );
          if (open.status === 'open' && open.url) {
            return res.status(200).json({ checkout_url: open.url });
          }
        } catch {
          // Fall through rather than block a guest from adding time.
        }
      }

      const { rows: payRows } = await query(
        `INSERT INTO parking_payments
           (session_id, type, purpose, method, amount_cents, subtotal_cents, tax_cents,
            rate_type, quantity, status)
         VALUES ($1,'charge','extension','stripe',$2,$3,$4,$5,$6,'pending')
         RETURNING id`,
        [session.id, price.total, price.subtotal, price.tax, rate_type, quantity],
      );
      const paymentId = payRows[0].id;

      const base = publicBaseUrl();
      const line = stripeLineAmount(price);
      let checkout;
      try {
        checkout = await getStripe().checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: line.unitAmount,
                product_data: {
                  name: `${s.brand_name} — Parking extension, ${durationLabel(rate_type, quantity)} (${session.plate})`,
                },
              },
              ...(line.taxRates ? { tax_rates: line.taxRates } : {}),
            },
          ],
          metadata: { parking_session_id: String(session.id), payment_id: String(paymentId) },
          customer_email: session.email || undefined,
          success_url: `${base}/park/s/${token}?paid=1`,
          cancel_url: `${base}/park/s/${token}?canceled=1`,
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // Stripe requires >= 30 min; 60 leaves headroom for latency/clock skew
        });
      } catch (err) {
        await query(`UPDATE parking_payments SET status='failed', updated_at=now() WHERE id=$1`, [paymentId]);
        throw err;
      }

      await query(
        `UPDATE parking_payments SET stripe_checkout_session_id=$1, updated_at=now() WHERE id=$2`,
        [checkout.id, paymentId],
      );

      res.status(201).json({ checkout_url: checkout.url });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
