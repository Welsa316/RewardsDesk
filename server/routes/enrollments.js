import { Router } from 'express';
import { query, withTransaction } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr, isEmail, isPhone, asBool } from '../lib/validation.js';
import { STATUSES, QUALIFICATIONS, SORT_COLUMNS, buildListQuery } from '../lib/enrollmentFilters.js';
import { logAudit, AUDIT_ACTIONS } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

// GET /api/enrollments — filtered, paginated, sorted list
router.get('/', async (req, res, next) => {
  try {
    const { whereSql, params } = buildListQuery(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const sortParam = Array.isArray(req.query.sort) ? req.query.sort[0] : req.query.sort;
    const dirParam = Array.isArray(req.query.dir) ? req.query.dir[0] : req.query.dir;
    const sortKey = SORT_COLUMNS[sortParam] || 'e.created_at';
    const dir = String(dirParam).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM enrollments e WHERE ${whereSql}`,
      params,
    );

    const { rows } = await query(
      `SELECT e.*, u.name AS processed_by_name, qu.name AS qualified_by_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.processed_by
         LEFT JOIN users qu ON qu.id = e.qualified_by
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

// GET /api/enrollments/duplicates — possible existing records for a guest, so
// staff are warned BEFORE typing someone into the Best Western terminal again.
// Declared before /:id so the literal path wins over the id param.
router.get('/duplicates', async (req, res, next) => {
  try {
    const first = (v) => (Array.isArray(v) ? v[0] : v);
    const email = cleanStr(first(req.query.email), 254).toLowerCase();
    const phone = cleanStr(first(req.query.phone), 32);
    const firstName = cleanStr(first(req.query.first_name), 100);
    const lastName = cleanStr(first(req.query.last_name), 100);
    const excludeId = parseInt(first(req.query.exclude_id), 10);

    const clauses = [];
    const params = [];
    if (email) {
      params.push(email);
      clauses.push(`lower(e.email) = $${params.length}`);
    }
    // Compare digits only so 504-555-1234 matches (504) 555 1234.
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length >= 7) {
      params.push(phoneDigits);
      clauses.push(`regexp_replace(COALESCE(e.phone,''), '\\D', '', 'g') = $${params.length}`);
    }
    if (firstName && lastName) {
      params.push(firstName, lastName);
      clauses.push(`(lower(e.first_name) = lower($${params.length - 1}) AND lower(e.last_name) = lower($${params.length}))`);
    }
    if (!clauses.length) return res.json({ matches: [] });

    let where = `e.deleted_at IS NULL AND (${clauses.join(' OR ')})`;
    if (Number.isInteger(excludeId)) {
      params.push(excludeId);
      where += ` AND e.id <> $${params.length}`;
    }

    const { rows } = await query(
      `SELECT e.id, e.first_name, e.last_name, e.email, e.phone, e.status, e.qualification,
              e.source, e.created_at, u.name AS processed_by_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.processed_by
        WHERE ${where}
        ORDER BY e.created_at DESC
        LIMIT 5`,
      params,
    );
    res.json({ matches: rows });
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
      `SELECT e.*, u.name AS processed_by_name, qu.name AS qualified_by_name
         FROM enrollments e
         LEFT JOIN users u ON u.id = e.processed_by
         LEFT JOIN users qu ON qu.id = e.qualified_by
        WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    const { rows: history } = await query(
      `SELECT h.id, h.action, h.old_status, h.new_status, h.detail, h.changed_at, h.changed_by,
              u.name AS changed_by_name
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
      await logAudit(client, {
        enrollmentId: row.id,
        action: AUDIT_ACTIONS.CREATED,
        detail: `Walk-up record created (${v.source})`,
        userId: req.user.id,
      });
      if (processed) {
        await logAudit(client, {
          enrollmentId: row.id,
          action: AUDIT_ACTIONS.STATUS_CHANGE,
          newStatus: status,
          userId: req.user.id,
        });
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
    const hasQualification = 'qualification' in (req.body ?? {});
    if (!hasStatus && !hasNotes && !hasQualification) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    let newStatus = existing.status;
    if (hasStatus) {
      if (!STATUSES.includes(req.body.status)) {
        return res.status(422).json({ error: 'Invalid status.' });
      }
      newStatus = req.body.status;
    }

    // Qualification is the outcome Best Western reports back, so only the owner
    // records it — and only on a record the desk actually enrolled.
    let qualification = existing.qualification;
    if (hasQualification) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only an admin can set qualification.' });
      }
      const q = req.body.qualification;
      if (q !== null && q !== '' && !QUALIFICATIONS.includes(q)) {
        return res.status(422).json({ error: 'Invalid qualification.' });
      }
      qualification = q === null || q === '' ? null : q;
      const effectiveStatus = hasStatus ? newStatus : existing.status;
      if (qualification && effectiveStatus !== 'enrolled') {
        return res.status(422).json({ error: 'Only an enrolled record can be qualified.' });
      }
    }

    const notes = hasNotes ? cleanStr(req.body.notes, 2000) || null : existing.notes;
    const statusChanged = hasStatus && newStatus !== existing.status;
    const notesChanged = hasNotes && notes !== existing.notes;
    // A record that leaves 'enrolled' can't carry a qualification with it.
    const clearQualification = statusChanged && newStatus !== 'enrolled' && existing.qualification;
    if (clearQualification) qualification = null;
    const qualificationChanged = qualification !== existing.qualification;

    const updated = await withTransaction(async (client) => {
      let row;
      if (statusChanged) {
        // A record moved back to 'pending' (queue Undo) has no processor —
        // clearing attribution keeps leaderboard processed/conversion honest.
        const backToPending = newStatus === 'pending';
        const { rows } = await client.query(
          `UPDATE enrollments
              SET status = $1, notes = $2,
                  processed_by = CASE WHEN $5 THEN NULL ELSE $3::int END,
                  processed_at = CASE WHEN $5 THEN NULL ELSE now() END,
                  qualification = $6,
                  qualified_by = CASE WHEN $6::text IS NULL THEN NULL ELSE $7::int END,
                  qualified_at = CASE WHEN $6::text IS NULL THEN NULL ELSE now() END,
                  updated_at = now()
            WHERE id = $4
            RETURNING *`,
          [newStatus, notes, req.user.id, id, backToPending, qualification, existing.qualified_by || req.user.id],
        );
        row = rows[0];
        await logAudit(client, {
          enrollmentId: id,
          action: AUDIT_ACTIONS.STATUS_CHANGE,
          oldStatus: existing.status,
          newStatus,
          userId: req.user.id,
        });
      } else if (qualificationChanged) {
        const { rows } = await client.query(
          `UPDATE enrollments
              SET qualification = $1, notes = $2,
                  qualified_by = CASE WHEN $1::text IS NULL THEN NULL ELSE $3::int END,
                  qualified_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END,
                  updated_at = now()
            WHERE id = $4
            RETURNING *`,
          [qualification, notes, req.user.id, id],
        );
        row = rows[0];
      } else {
        const { rows } = await client.query(
          'UPDATE enrollments SET notes = $1, updated_at = now() WHERE id = $2 RETURNING *',
          [notes, id],
        );
        row = rows[0];
      }

      if (qualificationChanged) {
        await logAudit(client, {
          enrollmentId: id,
          action: AUDIT_ACTIONS.QUALIFICATION,
          detail: qualification
            ? `Marked ${qualification}`
            : `Qualification cleared${clearQualification ? ' (status changed)' : ''}`,
          userId: req.user.id,
        });
      }
      if (notesChanged) {
        await logAudit(client, {
          enrollmentId: id,
          action: AUDIT_ACTIONS.NOTE_EDITED,
          detail: notes ? 'Notes updated' : 'Notes cleared',
          userId: req.user.id,
        });
      }
      return row;
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

// POST /api/enrollments/purge — admin-only. Soft-delete processed (non-pending)
// records whose processed_at is older than the given number of days.
router.post('/purge', requireAdmin, async (req, res, next) => {
  try {
    const days = parseInt(req.body?.days, 10);
    if (!Number.isInteger(days) || days < 1) {
      return res.status(400).json({ error: 'Provide a positive number of days.' });
    }
    const { rows } = await query(
      `UPDATE enrollments
          SET deleted_at = now(), updated_at = now()
        WHERE deleted_at IS NULL
          AND status <> 'pending'
          AND processed_at IS NOT NULL
          AND processed_at < now() - make_interval(days => $1)
        RETURNING id`,
      [days],
    );
    res.json({ purged: rows.length });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/enrollments/:id — admin-only soft delete.
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE enrollments SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [id],
      );
      if (!rows[0]) return null;
      await logAudit(client, {
        enrollmentId: id,
        action: AUDIT_ACTIONS.DELETED,
        detail: 'Record deleted',
        userId: req.user.id,
      });
      return rows[0];
    });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
