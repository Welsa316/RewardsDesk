import { Router } from 'express';
import { query } from '../db/index.js';
import { intakePerMinute, intakePerHour } from '../middleware/rateLimit.js';
import { validateIntake } from '../middleware/validate.js';
import { sendEnrollmentConfirmation, sendEnrollmentAdminAlert } from '../lib/email.js';
import { publicBaseUrl } from '../lib/stripe.js';

const router = Router();

// Public guest submission. Lands as a 'pending' enrollment for the front desk.
router.post('/intake', intakePerMinute, intakePerHour, validateIntake, async (req, res, next) => {
  try {
    const d = req.cleanIntake;
    await query(
      `INSERT INTO enrollments
         (first_name, last_name, email, phone, address_line1, address_line2, city, state,
          postal_code, country, source, consent, consent_at, prefilled, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, TRUE, now(), $12, 'pending')`,
      [
        d.first_name, d.last_name, d.email, d.phone, d.address_line1, d.address_line2,
        d.city, d.state, d.postal_code, d.country, d.source, d.prefilled,
      ],
    );
    // Minimal response — never echo stored PII.
    res.status(201).json({
      ok: true,
      message: 'Thanks! Stop by the front desk at check-in to finish setting up your rewards account.',
    });

    // Notifications are fired after responding and are never awaited into the
    // request: the enrollment is already saved, and a mail outage must not turn
    // a successful submission into an error for the guest.
    sendEnrollmentConfirmation({ to: d.email, firstName: d.first_name });
    sendEnrollmentAdminAlert({
      firstName: d.first_name,
      lastName: d.last_name,
      email: d.email,
      phone: d.phone,
      source: d.source,
      queueUrl: `${publicBaseUrl()}/admin/queue`,
    });
  } catch (err) {
    next(err);
  }
});

// Public branding only — nothing sensitive.
export default router;
