import { Router } from 'express';
import { query } from '../db/index.js';
import { invalidateSettings } from '../lib/settings.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { cleanStr } from '../lib/validation.js';
import { publicBaseUrl, stripeEnabled } from '../lib/stripe.js';
import { emailEnabled } from '../lib/email.js';
import { twilioEnabled } from '../lib/twilio.js';
import { storageAvailable } from '../lib/uploads.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const COLUMNS =
  'id, hotel_name, property_code, annual_goal, monthly_goal, sources, timezone, ' +
  'parking_brand_name, parking_capacity, parking_hourly_cents, parking_daily_cents, ' +
  'parking_lots, parking_expiring_soon_minutes, updated_at';

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${COLUMNS} FROM settings WHERE id = 1`);
    // The canonical origin, so printed QR codes carry the real domain rather
    // than whatever host the admin happened to generate them from. A sign
    // printed from localhost or a staging URL is permanently dead.
    // Booleans only — never the values. Lets the owner confirm a variable
    // actually landed on the host without reading it back out of the app,
    // which is otherwise guesswork until something fails in front of a guest.
    res.json({
      ...rows[0],
      public_base_url: publicBaseUrl(),
      integrations: {
        stripe: stripeEnabled(),
        email: emailEnabled(),
        sms: twilioEnabled(),
        uploads: storageAvailable(),
      },
    });
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
    if (typeof b.timezone === 'string' && b.timezone.trim()) {
      const tz = cleanStr(b.timezone, 64);
      if (!isValidTimezone(tz)) {
        return res.status(422).json({ error: 'Invalid timezone. Use an IANA name like America/Chicago.' });
      }
      params.push(tz);
      sets.push(`timezone = $${params.length}`);
    }
    if (Array.isArray(b.sources)) {
      const sources = [...new Set(b.sources.map((s) => cleanStr(s, 40)).filter(Boolean))].slice(0, 30);
      params.push(sources);
      sets.push(`sources = $${params.length}`);
    }

    // ── Parking config ──
    if (typeof b.parking_brand_name === 'string') {
      params.push(cleanStr(b.parking_brand_name, 100));
      sets.push(`parking_brand_name = $${params.length}`);
    }
    for (const key of ['parking_capacity', 'parking_hourly_cents', 'parking_daily_cents', 'parking_expiring_soon_minutes']) {
      if (b[key] !== undefined && b[key] !== null && b[key] !== '') {
        const n = Number(b[key]);
        if (!Number.isInteger(n) || n < 0) {
          return res.status(422).json({ error: `${key} must be a non-negative integer.` });
        }
        // Card networks reject charges under $0.50, so a lower rate would make
        // every checkout fail with an opaque Stripe error. Block it here.
        if ((key === 'parking_hourly_cents' || key === 'parking_daily_cents') && n < 50) {
          return res.status(422).json({
            error: 'Parking rates must be at least $0.50 — card payments below that are rejected.',
          });
        }
        params.push(n);
        sets.push(`${key} = $${params.length}`);
      }
    }
    if (Array.isArray(b.parking_lots)) {
      const lots = [...new Set(
        b.parking_lots.map((s) => cleanStr(s, 40).toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
      )].slice(0, 30);
      params.push(lots);
      sets.push(`parking_lots = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    sets.push('updated_at = now()');
    params.push(1);
    const { rows } = await query(
      `UPDATE settings SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    invalidateSettings(); // a saved change must be visible on the next request
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
