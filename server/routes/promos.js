import { Router } from 'express';
import express from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr } from '../lib/validation.js';
import { hotelTimezone } from '../lib/settings.js';
import {
  saveImage,
  deleteImage,
  storageAvailable,
  ACCEPTED_TYPES,
  MAX_BYTES,
} from '../lib/uploads.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Public ────────────────────────────────────────────────────────────────
// Active promos for the home page and the top of the parking form. "Active"
// is judged against the hotel's calendar day, so a promo ending on the 30th
// runs to the end of the 30th at the property rather than in UTC.
router.get('/public/promos', async (req, res, next) => {
  try {
    const tz = await hotelTimezone();
    const { rows } = await query(
      `SELECT id, title, image_url
         FROM promo_posts
        WHERE (now() AT TIME ZONE $1)::date BETWEEN start_date AND end_date
        ORDER BY start_date DESC, id DESC`,
      [tz],
    );
    res.json({ promos: rows });
  } catch (err) {
    next(err);
  }
});

// ── Admin ─────────────────────────────────────────────────────────────────
router.use('/promos', requireAuth, requireAdmin);

router.get('/promos', async (req, res, next) => {
  try {
    const tz = await hotelTimezone();
    const { rows } = await query(
      `SELECT p.*, u.name AS created_by_name,
              ((now() AT TIME ZONE $1)::date BETWEEN p.start_date AND p.end_date) AS is_active
         FROM promo_posts p
         LEFT JOIN users u ON u.id = p.created_by
        ORDER BY p.start_date DESC, p.id DESC`,
      [tz],
    );
    res.json({ promos: rows, storage_ok: storageAvailable() });
  } catch (err) {
    next(err);
  }
});

// Raw image body rather than multipart, so this needs no parser dependency.
// The Content-Type header names the format and is checked against a whitelist.
router.post(
  '/promos/image',
  express.raw({ type: ACCEPTED_TYPES, limit: MAX_BYTES }),
  async (req, res, next) => {
    try {
      if (!storageAvailable()) {
        return res.status(503).json({
          error: 'Image storage is not configured. Attach a volume and set UPLOAD_DIR.',
        });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'No image received.' });
      }
      const type = (req.get('content-type') || '').split(';')[0].trim();
      if (!ACCEPTED_TYPES.includes(type)) {
        return res.status(415).json({ error: 'Use a PNG, JPEG, WebP, or GIF image.' });
      }
      res.status(201).json({ image_url: saveImage(req.body, type) });
    } catch (err) {
      next(err);
    }
  },
);

// Two rows can point at the same file if an image_url is reused, and removing
// one row must not blank the other's image. Check before unlinking.
async function deleteImageIfUnused(imageUrl) {
  if (!imageUrl) return;
  const { rows } = await query(
    'SELECT 1 FROM promo_posts WHERE image_url = $1 LIMIT 1',
    [imageUrl],
  );
  if (!rows.length) deleteImage(imageUrl);
}

function readBody(body) {
  const title = cleanStr(body?.title, 120);
  const image_url = cleanStr(body?.image_url, 500);
  const start_date = cleanStr(body?.start_date, 10);
  const end_date = cleanStr(body?.end_date, 10);

  const fields = {};
  if (!title) fields.title = 'A title is required.';
  if (!image_url) fields.image_url = 'Upload an image.';
  if (!DATE_RE.test(start_date)) fields.start_date = 'Choose a start date.';
  if (!DATE_RE.test(end_date)) fields.end_date = 'Choose an end date.';
  if (!fields.start_date && !fields.end_date && end_date < start_date) {
    fields.end_date = 'The end date must be on or after the start date.';
  }
  return { title, image_url, start_date, end_date, fields };
}

router.post('/promos', async (req, res, next) => {
  try {
    const c = readBody(req.body);
    if (Object.keys(c.fields).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: c.fields });
    }
    const { rows } = await query(
      `INSERT INTO promo_posts (title, image_url, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [c.title, c.image_url, c.start_date, c.end_date, req.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/promos/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const c = readBody(req.body);
    if (Object.keys(c.fields).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: c.fields });
    }

    const { rows: existing } = await query('SELECT image_url FROM promo_posts WHERE id = $1', [id]);
    if (!existing[0]) return res.status(404).json({ error: 'Promo not found.' });

    const { rows } = await query(
      `UPDATE promo_posts SET title=$1, image_url=$2, start_date=$3, end_date=$4
        WHERE id=$5 RETURNING *`,
      [c.title, c.image_url, c.start_date, c.end_date, id],
    );
    // Only bin the old file once the row pointing at it is gone, and only if
    // no other promo is still using it.
    if (existing[0].image_url !== c.image_url) await deleteImageIfUnused(existing[0].image_url);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/promos/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await query('DELETE FROM promo_posts WHERE id = $1 RETURNING image_url', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Promo not found.' });
    await deleteImageIfUnused(rows[0].image_url);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
