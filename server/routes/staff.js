import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr, isEmail } from '../lib/validation.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const PUBLIC_COLUMNS = 'id, name, email, role, active, created_at';

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY created_at ASC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = cleanStr(req.body?.name, 100);
    const email = cleanStr(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role === 'admin' ? 'admin' : 'staff';

    const errors = {};
    if (!name) errors.name = 'Name is required.';
    if (!email) errors.email = 'Email is required.';
    else if (!isEmail(email)) errors.email = 'Enter a valid email address.';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });
    }

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'A user with that email already exists.', fields: { email: 'Already in use.' } });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING ${PUBLIC_COLUMNS}`,
      [name, email, hash, role],
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

    const { rows: existing } = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (!existing[0]) return res.status(404).json({ error: 'Not found' });

    const sets = [];
    const params = [];
    if (typeof req.body?.name === 'string') {
      params.push(cleanStr(req.body.name, 100));
      sets.push(`name = $${params.length}`);
    }
    if (req.body?.role === 'admin' || req.body?.role === 'staff') {
      params.push(req.body.role);
      sets.push(`role = $${params.length}`);
    }
    if (typeof req.body?.active === 'boolean') {
      if (req.body.active === false && id === req.user.id) {
        return res.status(400).json({ error: "You can't deactivate your own account." });
      }
      params.push(req.body.active);
      sets.push(`active = $${params.length}`);
    }
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (req.body.password.length < 8) {
        return res.status(422).json({ error: 'Password must be at least 8 characters.', fields: { password: 'Too short.' } });
      }
      params.push(await bcrypt.hash(req.body.password, 12));
      sets.push(`password_hash = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PUBLIC_COLUMNS}`,
      params,
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Deactivate (soft) — keeps the user's attribution on past enrollments intact.
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    if (id === req.user.id) return res.status(400).json({ error: "You can't deactivate your own account." });

    const { rows } = await query('UPDATE users SET active = FALSE WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
