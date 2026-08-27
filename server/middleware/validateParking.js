import { cleanPlateState } from '../lib/states.js';
import { cleanStr, isEmail, isPhone } from '../lib/validation.js';

// Validates + sanitizes a public parking checkout request, attaching the
// normalized payload as req.cleanParking. Price/lot validation happens in the
// route (they need settings); this gate covers presence, formats, and spam.
export function validateParking(req, res, next) {
  const b = req.body ?? {};

  // Honeypot: hidden field real guests never see. Fake success for bots.
  if (cleanStr(b.hp_url)) {
    return res.status(200).json({ ok: true });
  }

  const errors = {};
  const guest_name = cleanStr(b.guest_name, 100);
  if (!guest_name) errors.guest_name = 'Name is required.';

  const phone = cleanStr(b.phone, 32);
  if (!phone) errors.phone = 'Phone number is required.';
  else if (!isPhone(phone)) errors.phone = 'Enter a valid phone number.';

  const plate = cleanStr(b.plate, 16).toUpperCase();
  if (!plate) errors.plate = 'License plate is required.';
  // Unrecognised or absent states store as NULL rather than failing the
  // submission — the plate is what identifies the car.
  const plate_state = cleanPlateState(b.plate_state);

  const email = cleanStr(b.email, 254).toLowerCase();
  if (email && !isEmail(email)) errors.email = 'Enter a valid email address.';

  // Daily only. A prefilled link carrying rate=hourly (the old contract) is
  // rejected rather than silently repriced.
  const rate_type = b.rate_type === 'daily' ? 'daily' : null;
  if (!rate_type) errors.rate_type = 'Parking is sold by the day.';
  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = 'Choose a duration.';

  if (Object.keys(errors).length) {
    return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }

  req.cleanParking = {
    guest_name,
    phone,
    email: email || null,
    plate,
    plate_state,
    vehicle_desc: cleanStr(b.vehicle_desc, 120) || null,
    room: cleanStr(b.room, 20) || null,
    lot: cleanStr(b.lot, 40) || null,
    rate_type,
    quantity,
  };
  next();
}
