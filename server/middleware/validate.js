import { cleanStr, isEmail, isPhone, asBool } from '../lib/validation.js';
import { query } from '../db/index.js';

const FALLBACK_SOURCE = 'other';

// Validates + sanitizes a public intake submission and, on success, attaches a
// normalized payload as req.cleanIntake. Responds directly on honeypot trip or
// validation failure so the route handler only ever sees clean data.
export async function validateIntake(req, res, next) {
  try {
    const b = req.body ?? {};

    // Honeypot: a hidden field real users never see. If a bot fills it, pretend
    // success (200) so we don't reveal the trap, but store nothing.
    if (cleanStr(b.hp_url)) {
      return res.status(200).json({ ok: true });
    }

    const errors = {};
    const first_name = cleanStr(b.first_name, 100);
    const last_name = cleanStr(b.last_name, 100);
    if (!first_name) errors.first_name = 'First name is required.';
    if (!last_name) errors.last_name = 'Last name is required.';

    const consent = asBool(b.consent);
    if (!consent) errors.consent = 'Consent is required to submit.';

    const email = cleanStr(b.email, 254).toLowerCase();
    if (email && !isEmail(email)) errors.email = 'Enter a valid email address.';

    const phone = cleanStr(b.phone, 32);
    if (phone && !isPhone(phone)) errors.phone = 'Enter a valid phone number.';

    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });
    }

    // Only accept a source the hotel has configured; otherwise tag as 'other'.
    let source = FALLBACK_SOURCE;
    const requested = cleanStr(b.source, 40);
    if (requested) {
      const { rows } = await query('SELECT sources FROM settings WHERE id = 1');
      const allowed = rows[0]?.sources ?? [];
      if (allowed.includes(requested)) source = requested;
    }

    req.cleanIntake = {
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
      prefilled: asBool(b.prefilled),
    };
    next();
  } catch (err) {
    next(err);
  }
}
