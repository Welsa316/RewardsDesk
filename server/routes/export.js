import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { buildListQuery } from '../lib/enrollmentFilters.js';

const router = Router();
// Bulk PII export is owner-level per the spec (admin: "export CSV") — staff
// keep per-record access via the list/detail endpoints they need for the desk.
router.use(requireAuth, requireAdmin);

// Above this, refuse rather than silently truncate (the client also pre-checks).
const EXPORT_CAP = 10000;

const COLUMNS = [
  ['id', 'ID'],
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['address_line1', 'Address 1'],
  ['address_line2', 'Address 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['postal_code', 'ZIP'],
  ['country', 'Country'],
  ['source', 'Source'],
  ['status', 'Status'],
  ['prefilled', 'Prefilled'],
  ['consent', 'Consent'],
  ['consent_at', 'Consent at'],
  ['processed_by_name', 'Processed by'],
  ['processed_at', 'Processed at'],
  ['created_at', 'Created at'],
  ['notes', 'Notes'],
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/export — CSV of all records matching the current list filters.
router.get('/', async (req, res, next) => {
  try {
    const { whereSql, params } = buildListQuery(req.query);

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM enrollments e WHERE ${whereSql}`,
      params,
    );
    const total = countRows[0].total;
    if (total > EXPORT_CAP) {
      return res.status(422).json({
        error: `This export matches ${total} records, over the ${EXPORT_CAP} limit. Narrow the filters (e.g. a date range) and export in batches.`,
      });
    }

    const { rows } = await query(
      `SELECT e.*, u.name AS processed_by_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.processed_by
        WHERE ${whereSql}
        ORDER BY e.created_at DESC, e.id DESC`,
      params,
    );

    const header = COLUMNS.map(([, label]) => csvCell(label)).join(',');
    const body = rows.map((r) => COLUMNS.map(([key]) => csvCell(r[key])).join(','));
    const csv = [header, ...body].join('\r\n');

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="enrollments-${stamp}.csv"`);
    res.setHeader('X-Total-Count', String(total));
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
