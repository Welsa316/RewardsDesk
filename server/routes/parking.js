// Staff/admin parking API. Display status is always the shared derived SQL —
// never recomputed ad hoc — so lists, dashboard, and the guest page agree.
import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, readOnlyForStaff } from '../middleware/requireAdmin.js';
import { getStripe, publicBaseUrl } from '../lib/stripe.js';
import { activeDailyRate } from '../lib/parkingRates.js';
import { cleanStr, isEmail, isPhone } from '../lib/validation.js';
import {
  priceCents,
  durationHours,
  generateConfirmationCode,
  derivedStatusSql,
} from '../lib/parking.js';

const router = Router();
// Staff may view parked cars. Creating sessions, checking vehicles out,
// extending, adding notes and refunding are all admin-only.
router.use(requireAuth, readOnlyForStaff);

const DERIVED_STATUSES = [
  'pending_payment',
  'active',
  'expiring_soon',
  'expired',
  'departed',
  'complimentary',
  'canceled',
];

const first = (v) => (Array.isArray(v) ? v[0] : v);

async function parkingConfig() {
  const { rows } = await query(
    `SELECT parking_capacity, parking_expiring_soon_minutes,
            parking_daily_cents, parking_lots, timezone
       FROM settings WHERE id = 1`,
  );
  return rows[0];
}

const NET_PAID_JOIN = `
  LEFT JOIN (
    SELECT session_id,
           COALESCE(SUM(amount_cents) FILTER (WHERE type='charge' AND status='succeeded'), 0)::int
         - COALESCE(SUM(amount_cents) FILTER (WHERE type='refund' AND status='succeeded'), 0)::int
           AS net_paid_cents
      FROM parking_payments GROUP BY session_id
  ) pay ON pay.session_id = ps.id`;

// GET /api/parking/sessions — filtered, paginated live view.
router.get('/sessions', async (req, res, next) => {
  try {
    const cfg = await parkingConfig();
    const statusSql = derivedStatusSql('ps', cfg.parking_expiring_soon_minutes);

    const where = [];
    const params = [];

    const status = first(req.query.status);
    if (status && DERIVED_STATUSES.includes(status)) {
      where.push(`${statusSql} = '${status}'`); // literal from whitelist above
    } else {
      // Default view: real vehicles only.
      where.push(`ps.disposition NOT IN ('pending_payment', 'canceled')`);
    }

    const kind = first(req.query.kind);
    if (kind && ['online', 'desk', 'comp'].includes(kind)) {
      params.push(kind);
      where.push(`ps.kind = $${params.length}`);
    }
    const lot = cleanStr(first(req.query.lot), 40);
    if (lot) {
      params.push(lot);
      where.push(`ps.lot = $${params.length}`);
    }
    const q = cleanStr(first(req.query.q), 100);
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(
        `(ps.plate ILIKE $${i} OR ps.guest_name ILIKE $${i} OR ps.phone ILIKE $${i} OR ps.confirmation_code ILIKE $${i})`,
      );
    }

    const page = Math.max(1, parseInt(first(req.query.page), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(first(req.query.pageSize), 10) || 25));
    const whereSql = where.length ? where.join(' AND ') : 'TRUE';

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM parking_sessions ps WHERE ${whereSql}`,
      params,
    );
    const { rows } = await query(
      `SELECT ps.id, ps.confirmation_code, ps.guest_name, ps.phone, ps.plate, ps.vehicle_desc,
              ps.room, ps.lot, ps.kind, ps.rate_type, ps.quantity, ps.disposition,
              ps.starts_at, ps.paid_through, ps.created_at, ps.checked_out_at,
              ${statusSql} AS status,
              COALESCE(pay.net_paid_cents, 0) AS net_paid_cents,
              cu.name AS created_by_name, xu.name AS checked_out_by_name
         FROM parking_sessions ps
         ${NET_PAID_JOIN}
         LEFT JOIN users cu ON cu.id = ps.created_by
         LEFT JOIN users xu ON xu.id = ps.checked_out_by
        WHERE ${whereSql}
        ORDER BY ps.created_at DESC, ps.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    res.json({ data: rows, total: countRows[0].total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/parking/sessions/:id — detail + payments + notes.
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const cfg = await parkingConfig();
    const statusSql = derivedStatusSql('ps', cfg.parking_expiring_soon_minutes);
    const { rows } = await query(
      `SELECT ps.*, ${statusSql} AS status,
              COALESCE(pay.net_paid_cents, 0) AS net_paid_cents,
              cu.name AS created_by_name, xu.name AS checked_out_by_name
         FROM parking_sessions ps
         ${NET_PAID_JOIN}
         LEFT JOIN users cu ON cu.id = ps.created_by
         LEFT JOIN users xu ON xu.id = ps.checked_out_by
        WHERE ps.id = $1`,
      [id],
    );
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Not found' });

    const [{ rows: payments }, { rows: notes }] = await Promise.all([
      query(
        `SELECT p.id, p.type, p.purpose, p.method, p.amount_cents, p.rate_type, p.quantity,
                p.status, p.receipt_url, p.note, p.created_at, p.stripe_payment_intent_id,
                p.refunded_payment_id, u.name AS created_by_name
           FROM parking_payments p
           LEFT JOIN users u ON u.id = p.created_by
          WHERE p.session_id = $1
          ORDER BY p.created_at ASC, p.id ASC`,
        [id],
      ),
      query(
        `SELECT n.id, n.body, n.created_at, u.name AS author_name
           FROM parking_notes n
           LEFT JOIN users u ON u.id = n.author_id
          WHERE n.session_id = $1
          ORDER BY n.created_at ASC, n.id ASC`,
        [id],
      ),
    ]);

    // Build the guest's link from the canonical origin, not from whatever host
    // the agent happens to be on — a staff member working from the platform's
    // generated address would otherwise text a guest a URL carrying the app's
    // name, which is the same white-label leak through a different door.
    res.json({
      ...session,
      guest_url: session.status_token ? `${publicBaseUrl()}/park/s/${session.status_token}` : null,
      payments,
      notes,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/sessions — staff-created comp or paid-at-desk session.
// Immediately active; price always computed server-side.
router.post('/sessions', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const errors = {};

    const kind = b.kind === 'comp' ? 'comp' : b.kind === 'desk' ? 'desk' : null;
    if (!kind) errors.kind = 'Choose complimentary or paid at desk.';

    const guest_name = cleanStr(b.guest_name, 100);
    if (!guest_name) errors.guest_name = 'Name is required.';
    const plate = cleanStr(b.plate, 16).toUpperCase();
    if (!plate) errors.plate = 'License plate is required.';
    const phone = cleanStr(b.phone, 32);
    if (phone && !isPhone(phone)) errors.phone = 'Enter a valid phone number.';
    const email = cleanStr(b.email, 254).toLowerCase();
    if (email && !isEmail(email)) errors.email = 'Enter a valid email address.';

    const rate_type = b.rate_type === 'daily' ? 'daily' : null;
    const quantity = Number(b.quantity);

    let desk_method = null;
    let comp_reason = null;
    let comp_authorized_by = null;
    if (kind === 'desk') {
      desk_method = ['cash', 'card_terminal'].includes(b.desk_method) ? b.desk_method : null;
      if (!desk_method) errors.desk_method = 'Choose cash or card terminal.';
    }
    if (kind === 'comp') {
      comp_reason = cleanStr(b.comp_reason, 200);
      comp_authorized_by = cleanStr(b.comp_authorized_by, 100);
      if (!comp_reason) errors.comp_reason = 'A reason is required for complimentary parking.';
      if (!comp_authorized_by) errors.comp_authorized_by = 'Who authorized this?';
    }

    const cfg = await parkingConfig();
    const { rateCents } = await activeDailyRate(cfg.parking_daily_cents);
    const amount = rate_type
      ? priceCents(rate_type, quantity, { parking_daily_cents: rateCents })
      : null;
    if (amount === null) errors.quantity = 'Choose a valid duration.';

    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });
    }

    const lot = cfg.parking_lots.includes(cleanStr(b.lot, 40)) ? cleanStr(b.lot, 40) : null;
    const hours = durationHours(rate_type, quantity);
    const charged = kind === 'comp' ? 0 : amount;

    const created = await withTransaction(async (client) => {
      let session;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { rows } = await client.query(
            `INSERT INTO parking_sessions
               (confirmation_code, guest_name, phone, email, plate, vehicle_desc, room, lot, kind,
                desk_method, comp_reason, comp_authorized_by, rate_type, quantity, disposition,
                starts_at, paid_through, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',
                     now(), now() + make_interval(hours => $15), $16)
             RETURNING *`,
            [
              generateConfirmationCode(), guest_name, phone || null, email || null, plate,
              cleanStr(b.vehicle_desc, 120) || null, cleanStr(b.room, 20) || null, lot, kind,
              desk_method, comp_reason, comp_authorized_by, rate_type, quantity, hours, req.user.id,
            ],
          );
          session = rows[0];
          break;
        } catch (err) {
          if (err.code !== '23505' || !String(err.detail || '').includes('confirmation_code')) throw err;
        }
      }
      if (!session) throw new Error('Could not allocate a confirmation code.');

      await client.query(
        `INSERT INTO parking_payments
           (session_id, type, purpose, method, amount_cents, rate_type, quantity, status, created_by, note)
         VALUES ($1,'charge','initial',$2,$3,$4,$5,'succeeded',$6,$7)`,
        [
          session.id, kind === 'comp' ? 'comp' : desk_method, charged, rate_type, quantity,
          req.user.id, kind === 'comp' ? comp_reason : null,
        ],
      );
      return session;
    });

    res.status(201).json({ ...created, created_by_name: req.user.name });
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/sessions/:id/depart — vehicle check-out.
router.post('/sessions/:id/depart', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await query(
      `UPDATE parking_sessions
          SET disposition='departed', checked_out_by=$1, checked_out_at=now(), updated_at=now()
        WHERE id=$2 AND disposition='active'
        RETURNING id, disposition, checked_out_at`,
      [req.user.id, id],
    );
    if (!rows[0]) {
      // "Only an active session can be checked out" is true and useless at a
      // desk with a guest standing there. Two agents racing on the same car is
      // the common case, so say what actually happened to it.
      const { rows: cur } = await query(
        `SELECT ps.disposition, ps.checked_out_at, u.name AS checked_out_by_name
           FROM parking_sessions ps
           LEFT JOIN users u ON u.id = ps.checked_out_by
          WHERE ps.id = $1`,
        [id],
      );
      const c = cur[0];
      if (!c) return res.status(404).json({ error: 'That parking session no longer exists.' });
      if (c.disposition === 'departed') {
        const when = c.checked_out_at
          ? new Date(c.checked_out_at).toLocaleTimeString('en-US', {
              timeZone: (await parkingConfig()).timezone || 'UTC',
              hour: 'numeric',
              minute: '2-digit',
            })
          : null;
        return res.status(422).json({
          error: `Already checked out${when ? ` at ${when}` : ''}${c.checked_out_by_name ? ` by ${c.checked_out_by_name}` : ''}.`,
          already_departed: true,
        });
      }
      if (c.disposition === 'pending_payment') {
        return res.status(422).json({ error: "This guest hasn't completed payment, so there's nothing to check out." });
      }
      return res.status(422).json({ error: 'This session was canceled, so there is nothing to check out.' });
    }
    res.json({ ...rows[0], checked_out_by_name: req.user.name });
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/sessions/:id/extend — staff extension (desk pay or comp).
router.post('/sessions/:id/extend', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const method = ['cash', 'card_terminal', 'comp'].includes(req.body?.method)
      ? req.body.method
      : null;
    const rate_type = req.body?.rate_type === 'daily' ? 'daily' : null;
    const quantity = Number(req.body?.quantity);
    if (!method) return res.status(422).json({ error: 'Choose how the extension is paid.' });

    const cfg = await parkingConfig();
    const { rateCents } = await activeDailyRate(cfg.parking_daily_cents);
    const amount = rate_type
      ? priceCents(rate_type, quantity, { parking_daily_cents: rateCents })
      : null;
    if (amount === null) return res.status(422).json({ error: 'Choose a valid duration.' });

    const hours = durationHours(rate_type, quantity);
    const charged = method === 'comp' ? 0 : amount;

    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE parking_sessions
            SET paid_through = GREATEST(paid_through, now()) + make_interval(hours => $1),
                updated_at = now()
          WHERE id = $2 AND disposition = 'active'
          RETURNING id, paid_through`,
        [hours, id],
      );
      if (!rows[0]) return null;
      await client.query(
        `INSERT INTO parking_payments
           (session_id, type, purpose, method, amount_cents, rate_type, quantity, status, created_by)
         VALUES ($1,'charge','extension',$2,$3,$4,$5,'succeeded',$6)`,
        [id, method, charged, rate_type, quantity, req.user.id],
      );
      return rows[0];
    });

    if (!updated) return res.status(422).json({ error: 'Only an active session can be extended.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/sessions/:id/notes
router.post('/sessions/:id/notes', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const body = cleanStr(req.body?.body, 1000);
    if (!body) return res.status(422).json({ error: 'Note text is required.' });

    const { rows: exists } = await query('SELECT 1 FROM parking_sessions WHERE id=$1', [id]);
    if (!exists[0]) return res.status(404).json({ error: 'Not found' });

    const { rows } = await query(
      `INSERT INTO parking_notes (session_id, author_id, body)
       VALUES ($1,$2,$3) RETURNING id, body, created_at`,
      [id, req.user.id, body],
    );
    res.status(201).json({ ...rows[0], author_name: req.user.name });
  } catch (err) {
    next(err);
  }
});

// POST /api/parking/sessions/:id/refund — ADMIN. Full or partial refund of a
// specific charge. Stripe charges refund through Stripe; desk/cash charges are
// recorded-only (money handed back at the desk). Always audited.
router.post('/sessions/:id/refund', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const paymentId = parseInt(req.body?.payment_id, 10);
    if (!Number.isInteger(id) || !Number.isInteger(paymentId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const reason = cleanStr(req.body?.reason, 200);
    if (!reason) return res.status(422).json({ error: 'A refund reason is required.' });

    // An explicit null is NOT "no amount given" — JSON.stringify turns NaN into
    // null, so a malformed dollar box would otherwise arrive as a full refund.
    // Only an absent key means "refund everything that is left".
    const rawAmount = req.body?.amount_cents;
    const amountGiven = rawAmount !== undefined;
    if (amountGiven && !Number.isInteger(rawAmount)) {
      return res.status(422).json({ error: 'Enter a refund amount in dollars, e.g. 12.50.' });
    }

    // The whole read-decide-write runs under a row lock on the payment being
    // refunded: two admins refunding the same charge at once would otherwise
    // both read the same already_refunded and both pass the over-refund guard.
    const result = await withTransaction(async (client) => {
      const { rows: payRows } = await client.query(
        `SELECT * FROM parking_payments WHERE id = $1 AND session_id = $2 FOR UPDATE`,
        [paymentId, id],
      );
      const payment = payRows[0];
      if (!payment) return { code: 404, body: { error: 'Payment not found.' } };
      if (payment.type !== 'charge' || payment.status !== 'succeeded' || payment.amount_cents === 0) {
        return { code: 422, body: { error: 'Only a succeeded charge can be refunded.' } };
      }

      // Read the refunded-so-far total only after the lock is held. In READ
      // COMMITTED each statement takes a fresh snapshot, so a refund committed
      // by the transaction we just waited on is visible here.
      const { rows: sumRows } = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS already_refunded
           FROM parking_payments
          WHERE refunded_payment_id = $1 AND type='refund' AND status='succeeded'`,
        [paymentId],
      );
      const refundable = payment.amount_cents - sumRows[0].already_refunded;
      const amount = amountGiven ? rawAmount : refundable;
      if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) {
        return {
          code: 422,
          body: {
            error: `Refund must be between $0.01 and the remaining $${(refundable / 100).toFixed(2)} on this payment.`,
          },
        };
      }

      if (payment.method === 'stripe') {
        if (!payment.stripe_payment_intent_id) {
          return { code: 422, body: { error: 'This payment has no Stripe reference.' } };
        }
        const refund = await getStripe().refunds.create(
          { payment_intent: payment.stripe_payment_intent_id, amount },
          // Retrying this exact refund (double-submit, proxy retry) returns the
          // original refund instead of moving money twice.
          { idempotencyKey: `rfnd-${paymentId}-${amount}-${req.user.id}` },
        );
        // The charge.refunded webhook may race us — same stripe_refund_id either
        // way, so exactly one audit row survives, annotated with the actor.
        await client.query(
          `INSERT INTO parking_payments
             (session_id, type, purpose, method, amount_cents, status, stripe_refund_id,
              stripe_payment_intent_id, refunded_payment_id, created_by, note)
           VALUES ($1,'refund','refund','stripe',$2,'succeeded',$3,$4,$5,$6,$7)
           ON CONFLICT (stripe_refund_id) DO UPDATE
             SET created_by = EXCLUDED.created_by, note = EXCLUDED.note,
                 refunded_payment_id = EXCLUDED.refunded_payment_id, updated_at = now()`,
          [id, amount, refund.id, payment.stripe_payment_intent_id, paymentId, req.user.id, reason],
        );
      } else {
        // Desk/cash refund: recorded-only; the money changes hands at the desk.
        await client.query(
          `INSERT INTO parking_payments
             (session_id, type, purpose, method, amount_cents, status, refunded_payment_id, created_by, note)
           VALUES ($1,'refund','refund',$2,$3,'succeeded',$4,$5,$6)`,
          [id, payment.method, amount, paymentId, req.user.id, reason],
        );
      }
      return { code: 201, body: { ok: true, refunded_cents: amount, method: payment.method } };
    });

    res.status(result.code).json(result.body);
  } catch (err) {
    next(err);
  }
});

// GET /api/parking/dashboard — capacity + occupancy + today, hotel timezone.
router.get('/dashboard', async (req, res, next) => {
  try {
    const cfg = await parkingConfig();
    const statusSql = derivedStatusSql('ps', cfg.parking_expiring_soon_minutes);
    const tz = cfg.timezone || 'UTC';

    const { rows } = await query(
      `WITH s AS (
         SELECT ${statusSql} AS status, ps.paid_through, ps.disposition
           FROM parking_sessions ps
       )
       SELECT
         count(*) FILTER (WHERE disposition = 'active')::int AS occupying,
         count(*) FILTER (WHERE status IN ('active','expiring_soon'))::int AS active,
         count(*) FILTER (WHERE status = 'expiring_soon')::int AS expiring_soon,
         count(*) FILTER (WHERE status = 'expired')::int AS expired,
         count(*) FILTER (WHERE disposition = 'active'
           AND (paid_through AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::int AS leaving_today
       FROM s`,
      [tz],
    );

    const { rows: revRows } = await query(
      `SELECT
         COALESCE(SUM(amount_cents) FILTER (WHERE type='charge' AND status='succeeded'
           AND created_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)), 0)::int
       - COALESCE(SUM(amount_cents) FILTER (WHERE type='refund' AND status='succeeded'
           AND created_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)), 0)::int
         AS revenue_today_cents
       FROM parking_payments`,
      [tz],
    );

    const d = rows[0];
    res.json({
      capacity: cfg.parking_capacity,
      occupying: d.occupying,
      active: d.active,
      expiring_soon: d.expiring_soon,
      expired: d.expired,
      leaving_today: d.leaving_today,
      available: Math.max(0, cfg.parking_capacity - d.occupying),
      revenue_today_cents: revRows[0].revenue_today_cents,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/parking/revenue — reporting. Fixed today/week/month buckets in the
// hotel timezone plus metrics over an optional custom range (ISO instants).
const TS_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

router.get('/revenue', async (req, res, next) => {
  try {
    const cfg = await parkingConfig();
    const tz = cfg.timezone || 'UTC';

    const rawFrom = first(req.query.from);
    const rawTo = first(req.query.to);
    const from = TS_RE.test(rawFrom || '') ? rawFrom : null;
    const to = TS_RE.test(rawTo || '') ? rawTo : null;

    const rangeConds = [];
    const rangeParams = [];
    if (from) {
      rangeParams.push(from);
      rangeConds.push(`p.created_at >= $${rangeParams.length}::timestamptz`);
    }
    if (to) {
      rangeParams.push(to);
      rangeConds.push(`p.created_at < $${rangeParams.length}::timestamptz`);
    }
    const rangeSql = rangeConds.length ? rangeConds.join(' AND ') : 'TRUE';

    // Fixed buckets ($1 = tz).
    const { rows: bucketRows } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN type='charge' THEN amount_cents ELSE -amount_cents END)
           FILTER (WHERE created_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)), 0)::int AS today_cents,
         COALESCE(SUM(CASE WHEN type='charge' THEN amount_cents ELSE -amount_cents END)
           FILTER (WHERE created_at >= (date_trunc('week', now() AT TIME ZONE $1) AT TIME ZONE $1)), 0)::int AS week_cents,
         COALESCE(SUM(CASE WHEN type='charge' THEN amount_cents ELSE -amount_cents END)
           FILTER (WHERE created_at >= (date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1)), 0)::int AS month_cents
       FROM parking_payments p
       WHERE status='succeeded'`,
      [tz],
    );

    // Range metrics ($1.. = range bounds only).
    const { rows: rangeRows } = await query(
      `SELECT
         COALESCE(SUM(amount_cents) FILTER (WHERE type='charge'), 0)::int AS charges_cents,
         COALESCE(SUM(amount_cents) FILTER (WHERE type='refund'), 0)::int AS refunds_cents,
         -- Hourly is no longer sold; this remains so historical revenue still
         -- reconciles against sessions bought before the change.
         COALESCE(SUM(amount_cents) FILTER (WHERE type='charge' AND rate_type='hourly'), 0)::int AS hourly_cents,
         COALESCE(SUM(amount_cents) FILTER (WHERE type='charge' AND rate_type='daily'), 0)::int AS daily_cents,
         COALESCE(ROUND(AVG(amount_cents) FILTER (WHERE type='charge' AND amount_cents > 0)), 0)::int AS avg_transaction_cents,
         COUNT(DISTINCT session_id) FILTER (WHERE type='charge' AND amount_cents > 0)::int AS paid_vehicles
       FROM parking_payments p
       WHERE status='succeeded' AND ${rangeSql}`,
      rangeParams,
    );

    // Average stay over sessions that started in the range.
    const sessConds = [];
    const sessParams = [];
    if (from) {
      sessParams.push(from);
      sessConds.push(`ps.starts_at >= $${sessParams.length}::timestamptz`);
    }
    if (to) {
      sessParams.push(to);
      sessConds.push(`ps.starts_at < $${sessParams.length}::timestamptz`);
    }
    const { rows: stayRows } = await query(
      `SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ps.paid_through - ps.starts_at)) / 3600.0)::numeric, 1), 0)::float AS avg_stay_hours
         FROM parking_sessions ps
        WHERE ps.starts_at IS NOT NULL AND ps.paid_through IS NOT NULL
          AND ps.disposition IN ('active','departed')
          ${sessConds.length ? 'AND ' + sessConds.join(' AND ') : ''}`,
      sessParams,
    );

    const r = rangeRows[0];
    res.json({
      buckets: bucketRows[0],
      range: {
        from,
        to,
        net_cents: r.charges_cents - r.refunds_cents,
        charges_cents: r.charges_cents,
        refunds_cents: r.refunds_cents,
        hourly_cents: r.hourly_cents,
        daily_cents: r.daily_cents,
        avg_transaction_cents: r.avg_transaction_cents,
        paid_vehicles: r.paid_vehicles,
        avg_stay_hours: stayRows[0].avg_stay_hours,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/parking/export — ADMIN. Sessions CSV with payment totals.
const EXPORT_CAP = 10000;
const EXPORT_COLUMNS = [
  ['id', 'ID'],
  ['confirmation_code', 'Confirmation'],
  ['guest_name', 'Guest'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['plate', 'Plate'],
  ['vehicle_desc', 'Vehicle'],
  ['room', 'Room'],
  ['lot', 'Lot'],
  ['kind', 'Type'],
  ['status', 'Status'],
  ['rate_type', 'Rate'],
  ['quantity', 'Qty'],
  ['starts_at', 'Entered'],
  ['paid_through', 'Paid through'],
  ['net_paid_cents', 'Net paid'],
  ['comp_reason', 'Comp reason'],
  ['comp_authorized_by', 'Comp authorized by'],
  ['created_by_name', 'Created by'],
  ['checked_out_at', 'Checked out'],
  ['checked_out_by_name', 'Checked out by'],
  ['created_at', 'Created'],
];

// The owner opens this in Excel, so money is dollars and timestamps are local
// calendar time — not raw cents and UTC ISO strings.
function csvCell(v, tz) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(v).reduce((a, p) => ((a[p.type] = p.value), a), {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvMoney(cents) {
  if (cents === null || cents === undefined) return '';
  return (Number(cents) / 100).toFixed(2);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/export', requireAdmin, async (req, res, next) => {
  try {
    const cfg = await parkingConfig();
    const statusSql = derivedStatusSql('ps', cfg.parking_expiring_soon_minutes);
    const tz = cfg.timezone || 'UTC';

    // The button sits inside the date-range card, so it must filter by it.
    // Calendar days at the property, matching every other report.
    const first = (v) => (Array.isArray(v) ? v[0] : v);
    const from = first(req.query.from);
    const to = first(req.query.to);
    const where = [];
    const params = [];
    if (from && DATE_RE.test(from)) {
      params.push(tz, from);
      where.push(`ps.created_at >= ($${params.length}::date::timestamp AT TIME ZONE $${params.length - 1})`);
    }
    if (to && DATE_RE.test(to)) {
      params.push(tz, to);
      where.push(
        `ps.created_at < (($${params.length}::date + INTERVAL '1 day')::timestamp AT TIME ZONE $${params.length - 1})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM parking_sessions ps ${whereSql}`,
      params,
    );
    const total = countRows[0].total;
    if (total > EXPORT_CAP) {
      return res.status(422).json({
        error: `Export matches ${total} records, over the ${EXPORT_CAP} limit. Purge old data or export in batches.`,
      });
    }

    const { rows } = await query(
      `SELECT ps.*, ${statusSql} AS status,
              COALESCE(pay.net_paid_cents, 0) AS net_paid_cents,
              cu.name AS created_by_name, xu.name AS checked_out_by_name
         FROM parking_sessions ps
         ${NET_PAID_JOIN}
         LEFT JOIN users cu ON cu.id = ps.created_by
         LEFT JOIN users xu ON xu.id = ps.checked_out_by
         ${whereSql}
        ORDER BY ps.created_at DESC, ps.id DESC`,
      params,
    );

    const header = EXPORT_COLUMNS.map(([, label]) => csvCell(label, tz)).join(',');
    const body = rows.map((r) =>
      EXPORT_COLUMNS.map(([key]) =>
        key === 'net_paid_cents' ? csvMoney(r[key]) : csvCell(r[key], tz),
      ).join(','),
    );
    const csv = [header, ...body].join('\r\n');

    const range = from || to ? `-${from || 'start'}_${to || 'today'}` : '';
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="parking-sessions${range || `-${stamp}`}.csv"`);
    res.setHeader('X-Total-Count', String(total));
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
