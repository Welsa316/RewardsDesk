import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr, isEmail, isPhone, asBool } from '../lib/validation.js';
import { STATUSES, SORT_COLUMNS, buildListQuery } from '../lib/enrollmentFilters.js';

const router = Router();
router.use(requireAuth);

// GET /api/enrollments — filtered, paginated, sorted list
router.get('/', async (req, res, next) => {
  try {
    const { whereSql, params } = buildListQuery(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const sortKey = SORT_COLUMNS[req.query.sort] || 'e.created_at';
    const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM enrollments e WHERE ${whereSql}`,
      params,
    );

    const { rows } = await query(
      `SELECT e.*, u.name AS processed_by_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.processed_by
        WHERE ${whereSql}
        ORDER BY ${sortKey} ${dir}, e.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    res.json({ data: rows, total: countRows[0].total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/enrollments/:id — single record + status history
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await query(
      `SELECT e.*, u.name AS processed_by_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.processed_by
        WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    const { rows: history } = await query(
      `SELECT h.id, h.old_status, h.new_status, h.changed_at, h.changed_by, u.name AS changed_by_name
         FROM status_history h
         LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.enrollment_id = $1
        ORDER BY h.changed_at ASC, h.id ASC`,
      [id],
    );

    res.json({ ...rows[0], history });
  } catch (err) {
    next(err);
  }
});

// POST /api/enrollments — manual / walk-up creation, attributed to the agent
router.post('/', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const errors = {};
    const first_name = cleanStr(b.first_name, 100);
    const last_name = cleanStr(b.last_name, 100);
    if (!first_name) errors.first_name = 'First name is required.';
    if (!last_name) errors.last_name = 'Last name is required.';

    const email = cleanStr(b.email, 254).toLowerCase();
    if (email && !isEmail(email)) errors.email = 'Enter a valid email address.';
    const phone = cleanStr(b.phone, 32);
    if (phone && !isPhone(phone)) errors.phone = 'Enter a valid phone number.';

    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });
    }

    const status = STATUSES.includes(b.status) ? b.status : 'pending';

    // A logged-in agent creates these at the desk, so default the source there.
    let source = 'front-desk';
    const reqSource = cleanStr(b.source, 40);
    if (reqSource) {
      const { rows } = await query('SELECT sources FROM settings WHERE id = 1');
      if ((rows[0]?.sources ?? []).includes(reqSource)) source = reqSource;
    }

    const v = {
      first_name,
      last_name,
      email: email || null,
      phone: phone || null,
      address_line1: cleanStr(b.address_line1, 200) || null,
      address_line2: cleanStr(b.address_line2, 200) || null,
      city: cleanStr(b.city, 100) || null,
      state: cleanStr(b.state, 100) || null,
      postal_code: cleanStr(b.postal_code, 16) || null,
      country: cleanStr(b.country, 60) || 'US',
      source,
      consent: asBool(b.consent),
      notes: cleanStr(b.notes, 2000) || null,
    };
    const processed = status !== 'pending';

    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO enrollments
           (first_name, last_name, email, phone, address_line1, address_line2, city, state,
            postal_code, country, source, consent, consent_at, prefilled, status,
            processed_by, processed_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                 CASE WHEN $12 THEN now() ELSE NULL END, FALSE, $13,
                 CASE WHEN $14 THEN $15::int ELSE NULL END,
                 CASE WHEN $14 THEN now() ELSE NULL END, $16)
         RETURNING *`,
        [
          v.first_name, v.last_name, v.email, v.phone, v.address_line1, v.address_line2,
          v.city, v.state, v.postal_code, v.country, v.source, v.consent,
          status, processed, req.user.id, v.notes,
        ],
      );
      const row = rows[0];
      if (processed) {
        await client.query(
          `INSERT INTO status_history (enrollment_id, old_status, new_status, changed_by)
           VALUES ($1, NULL, $2, $3)`,
          [row.id, status, req.user.id],
        );
      }
      return row;
    });

    res.status(201).json({ ...created, processed_by_name: processed ? req.user.name : null });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/enrollments/:id — change status and/or notes
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const { rows: existingRows } = await query(
      'SELECT * FROM enrollments WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const hasStatus = typeof req.body?.status === 'string';
    const hasNotes = typeof req.body?.notes === 'string';
    if (!hasStatus && !hasNotes) return res.status(400).json({ error: 'Nothing to update.' });

    let newStatus = existing.status;
    if (hasStatus) {
      if (!STATUSES.includes(req.body.status)) {
        return res.status(422).json({ error: 'Invalid status.' });
      }
      newStatus = req.body.status;
    }
    const notes = hasNotes ? cleanStr(req.body.notes, 2000) || null : existing.notes;
    const statusChanged = hasStatus && newStatus !== existing.status;

    const updated = await withTransaction(async (client) => {
      if (statusChanged) {
        const { rows } = await client.query(
          `UPDATE enrollments
              SET status = $1, notes = $2, processed_by = $3, processed_at = now(), updated_at = now()
            WHERE id = $4
            RETURNING *`,
          [newStatus, notes, req.user.id, id],
        );
        await client.query(
          `INSERT INTO status_history (enrollment_id, old_status, new_status, changed_by)
           VALUES ($1, $2, $3, $4)`,
          [id, existing.status, newStatus, req.user.id],
        );
        return rows[0];
      }
      const { rows } = await client.query(
        'UPDATE enrollments SET notes = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [notes, id],
      );
      return rows[0];
    });

    let processed_by_name = null;
    if (updated.processed_by) {
      const { rows } = await query('SELECT name FROM users WHERE id = $1', [updated.processed_by]);
      processed_by_name = rows[0]?.name ?? null;
    }
    res.json({ ...updated, processed_by_name });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/enrollments/:id — admin-only soft delete.
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await query(
      'UPDATE enrollments SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
