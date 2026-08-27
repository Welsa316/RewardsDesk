import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr } from '../lib/validation.js';
import { hotelTimezone } from '../lib/settings.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const tz = await hotelTimezone();
    const { rows } = await query(
      `SELECT p.*, u.name AS created_by_name,
              ((now() AT TIME ZONE $1)::date BETWEEN p.start_date AND p.end_date) AS is_active
         FROM parking_promos p
         LEFT JOIN users u ON u.id = p.created_by
        ORDER BY p.start_date DESC, p.id DESC`,
      [tz],
    );
    const { rows: settings } = await query('SELECT parking_daily_cents FROM settings WHERE id = 1');
    res.json({ promos: rows, standard_daily_cents: settings[0]?.parking_daily_cents ?? 0 });
  } catch (err) {
    next(err);
  }
});

function readBody(body) {
  const name = cleanStr(body?.name, 80);
  const start_date = cleanStr(body?.start_date, 10);
  const end_date = cleanStr(body?.end_date, 10);
  // Accepts dollars from the form and stores cents, the same way the rate
  // fields in Parking Settings do.
  const rawRate = body?.rate_cents ?? null;
  const rate_cents = Number.isInteger(rawRate) ? rawRate : NaN;

  const fields = {};
  if (!name) fields.name = 'A name is required.';
  if (!DATE_RE.test(start_date)) fields.start_date = 'Choose a start date.';
  if (!DATE_RE.test(end_date)) fields.end_date = 'Choose an end date.';
  if (!fields.start_date && !fields.end_date && end_date < start_date) {
    fields.end_date = 'The end date must be on or after the start date.';
  }
  if (!Number.isInteger(rate_cents) || rate_cents <= 0) {
    fields.rate_cents = 'Enter a rate greater than zero.';
  }
  return { name, start_date, end_date, rate_cents, fields };
}

router.post('/', async (req, res, next) => {
  try {
    const c = readBody(req.body);
    if (Object.keys(c.fields).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: c.fields });
    }
    const { rows } = await query(
      `INSERT INTO parking_promos (name, start_date, end_date, rate_cents, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [c.name, c.start_date, c.end_date, c.rate_cents, req.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const c = readBody(req.body);
    if (Object.keys(c.fields).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: c.fields });
    }
    const { rows } = await query(
      `UPDATE parking_promos SET name=$1, start_date=$2, end_date=$3, rate_cents=$4
        WHERE id=$5 RETURNING *`,
      [c.name, c.start_date, c.end_date, c.rate_cents, id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Promo not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await query('DELETE FROM parking_promos WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Promo not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
