import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { getStripe, publicBaseUrl } from '../lib/stripe.js';
import {
  priceCents,
  durationHours,
  durationLabel,
  generateConfirmationCode,
  derivedStatusSql,
} from '../lib/parking.js';
import { reconcilePendingCheckouts } from '../lib/parkingActivation.js';
import { validateParking } from '../middleware/validateParking.js';
import {
  parkingCheckoutPerMinute,
  parkingCheckoutPerHour,
  parkingStatusLimiter,
} from '../middleware/rateLimit.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function parkingSettings() {
  const { rows } = await query(
    `SELECT COALESCE(parking_brand_name, hotel_name) AS brand_name,
            parking_hourly_cents, parking_daily_cents, parking_lots,
            parking_expiring_soon_minutes
       FROM settings WHERE id = 1`,
  );
  return rows[0];
}

// Public branding + rates for the guest form. Nothing sensitive, no capacity.
router.get('/public/parking-config', async (req, res, next) => {
  try {
    const s = await parkingSettings();
    res.json({
      brand_name: s.brand_name,
      hourly_cents: s.parking_hourly_cents,
      daily_cents: s.parking_daily_cents,
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
  parkingCheckoutPerHour,
  validateParking,
  async (req, res, next) => {
    try {
      const c = req.cleanParking;
      const s = await parkingSettings();

      const amount = priceCents(c.rate_type, c.quantity, {
        parking_hourly_cents: s.parking_hourly_cents,
        parking_daily_cents: s.parking_daily_cents,
      });
      if (amount === null) {
        return res.status(422).json({
          error: 'Please fix the highlighted fields.',
          fields: { quantity: 'Choose a valid duration.' },
        });
      }
      const lot = s.parking_lots.includes(c.lot) ? c.lot : null;

      // Guard against paying twice for the same car. A guest who loses their
      // status link and re-scans the lot sign lands on a blank form; without
      // this they can fill it in again and be charged a second time.
      // The status token is only handed back when the phone matches too — a
      // plate is visible on the car, so plate alone is not proof of ownership
      // (the status page carries the room number).
      const { rows: dupRows } = await query(
        `SELECT status_token, paid_through, phone
           FROM parking_sessions
          WHERE plate = $1 AND disposition = 'active' AND paid_through > now()
          ORDER BY paid_through DESC LIMIT 1`,
        [c.plate],
      );
      if (dupRows[0]) {
        const dup = dupRows[0];
        const samePhone = dup.phone && c.phone && dup.phone === c.phone;
        return res.status(409).json({
          error: `${c.plate} is already parked here until ${new Date(dup.paid_through).toISOString()}. You don't need to pay again.`,
          already_parked: true,
          paid_through: dup.paid_through,
          status_token: samePhone ? dup.status_token : undefined,
        });
      }

      // Rows first (committed), then the Stripe network call — a failed call
      // marks the rows failed/canceled rather than holding a transaction open.
      const created = await withTransaction(async (client) => {
        const session = await insertSession(
          client,
          `INSERT INTO parking_sessions
             (confirmation_code, guest_name, phone, email, plate, vehicle_desc, room, lot,
              kind, rate_type, quantity, disposition)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'online',$9,$10,'pending_payment')
           RETURNING id, status_token, confirmation_code`,
          [c.guest_name, c.phone, c.email, c.plate, c.vehicle_desc, c.room, lot, c.rate_type, c.quantity],
        );
        const { rows: payRows } = await client.query(
          `INSERT INTO parking_payments
             (session_id, type, purpose, method, amount_cents, rate_type, quantity, status)
           VALUES ($1,'charge','initial','stripe',$2,$3,$4,'pending')
           RETURNING id`,
          [session.id, amount, c.rate_type, c.quantity],
        );
        return { session, paymentId: payRows[0].id };
      });

      const base = publicBaseUrl();
      let checkout;
      try {
        checkout = await getStripe().checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: amount,
                product_data: {
                  name: `${s.brand_name} — Guest parking, ${durationLabel(c.rate_type, c.quantity)} (${c.plate})`,
                },
              },
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
    const selectSession = `SELECT ps.id, ps.confirmation_code, ps.plate, ps.room, ps.kind, ps.rate_type,
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
      room: session.room,
      kind: session.kind,
      status: session.status,
      starts_at: session.starts_at,
      paid_through: session.paid_through,
      server_now: new Date().toISOString(), // lets the countdown ignore client clock skew
      net_paid_cents: payRows[0].net_paid_cents,
      receipt_url: payRows[0].receipt_url,
      rates: { hourly_cents: s.parking_hourly_cents, daily_cents: s.parking_daily_cents },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/session/:token/extend — guest self-serve extension.
router.post(
  '/parking/session/:token/extend',
  parkingCheckoutPerMinute,
  parkingCheckoutPerHour,
  async (req, res, next) => {
    try {
      const token = req.params.token;
      if (!UUID_RE.test(token)) return res.status(404).json({ error: 'Not found' });

      const rate_type = req.body?.rate_type === 'daily' ? 'daily' : req.body?.rate_type === 'hourly' ? 'hourly' : null;
      const quantity = Number(req.body?.quantity);
      const s = await parkingSettings();
      const amount = rate_type
        ? priceCents(rate_type, quantity, {
            parking_hourly_cents: s.parking_hourly_cents,
            parking_daily_cents: s.parking_daily_cents,
          })
        : null;
      if (amount === null) {
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

      const { rows: payRows } = await query(
        `INSERT INTO parking_payments
           (session_id, type, purpose, method, amount_cents, rate_type, quantity, status)
         VALUES ($1,'charge','extension','stripe',$2,$3,$4,'pending')
         RETURNING id`,
        [session.id, amount, rate_type, quantity],
      );
      const paymentId = payRows[0].id;

      const base = publicBaseUrl();
      let checkout;
      try {
        checkout = await getStripe().checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: amount,
                product_data: {
                  name: `${s.brand_name} — Parking extension, ${durationLabel(rate_type, quantity)} (${session.plate})`,
                },
              },
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
