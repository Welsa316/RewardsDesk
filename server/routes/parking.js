// Staff/admin parking API. Display status is always the shared derived SQL —
// never recomputed ad hoc — so lists, dashboard, and the guest page agree.
import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cleanStr, isEmail, isPhone } from '../lib/validation.js';
import {
  priceCents,
  durationHours,
  generateConfirmationCode,
  derivedStatusSql,
} from '../lib/parking.js';

const router = Router();
router.use(requireAuth);

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
    `SELECT parking_capacity, parking_expiring_soon_minutes, parking_hourly_cents,
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
                u.name AS created_by_name
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

    res.json({ ...session, payments, notes });
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

    const rate_type = b.rate_type === 'daily' ? 'daily' : b.rate_type === 'hourly' ? 'hourly' : null;
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
    const amount = rate_type
      ? priceCents(rate_type, quantity, {
          parking_hourly_cents: cfg.parking_hourly_cents,
          parking_daily_cents: cfg.parking_daily_cents,
        })
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
      return res.status(422).json({ error: 'Only an active session can be checked out.' });
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
    const rate_type = req.body?.rate_type === 'daily' ? 'daily' : req.body?.rate_type === 'hourly' ? 'hourly' : null;
    const quantity = Number(req.body?.quantity);
    if (!method) return res.status(422).json({ error: 'Choose how the extension is paid.' });

    const cfg = await parkingConfig();
    const amount = rate_type
      ? priceCents(rate_type, quantity, {
          parking_hourly_cents: cfg.parking_hourly_cents,
          parking_daily_cents: cfg.parking_daily_cents,
        })
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

export default router;
