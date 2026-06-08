import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr } from '../lib/validation.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const COLUMNS = 'id, hotel_name, property_code, annual_goal, monthly_goal, sources, updated_at';

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${COLUMNS} FROM settings WHERE id = 1`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const sets = [];
    const params = [];

    if (typeof b.hotel_name === 'string') {
      params.push(cleanStr(b.hotel_name, 200));
      sets.push(`hotel_name = $${params.length}`);
    }
    if (typeof b.property_code === 'string') {
      params.push(cleanStr(b.property_code, 40));
      sets.push(`property_code = $${params.length}`);
    }
    for (const key of ['annual_goal', 'monthly_goal']) {
      if (b[key] !== undefined && b[key] !== null && b[key] !== '') {
        const n = Number(b[key]);
        if (Number.isFinite(n)) {
          params.push(Math.max(0, Math.round(n)));
          sets.push(`${key} = $${params.length}`);
        }
      }
    }
    if (Array.isArray(b.sources)) {
      const sources = [...new Set(b.sources.map((s) => cleanStr(s, 40)).filter(Boolean))].slice(0, 30);
      params.push(sources);
      sets.push(`sources = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    sets.push('updated_at = now()');
    params.push(1);
    const { rows } = await query(
      `UPDATE settings SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
