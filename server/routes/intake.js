import { Router } from 'express';
import { query } from '../db/index.js';
import { intakePerMinute, intakePerHour } from '../middleware/rateLimit.js';
import { validateIntake } from '../middleware/validate.js';
import {
  sendEnrollmentConfirmation,
  sendEnrollmentAdminAlert,
  sendDuplicateMemberAlert,
} from '../lib/email.js';
import { publicBaseUrl } from '../lib/stripe.js';

const router = Router();

// Public guest submission. Lands as a 'pending' enrollment for the front desk.
router.post('/intake', intakePerMinute, intakePerHour, validateIntake, async (req, res, next) => {
  try {
    const d = req.cleanIntake;
    const { rows: created } = await query(
      `INSERT INTO enrollments
         (first_name, last_name, email, phone, address_line1, address_line2, city, state,
          postal_code, country, source, consent, consent_at, prefilled, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, TRUE, now(), $12, 'pending')
       RETURNING id`,
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
    notifyIfDuplicate(d, created[0].id).catch((err) =>
      console.error('duplicate alert failed:', err?.message || err),
    );
  } catch (err) {
    next(err);
  }
});

// Public branding only — nothing sensitive.
/**
 * Alerts the desk when a submission matches someone already on file, so nobody
 * gets enrolled twice at the loyalty terminal. Matches on email, phone, or the
 * exact name — the same rules the queue's duplicate warning uses.
 */
async function notifyIfDuplicate(d, newId) {
  const clauses = [];
  const params = [];
  if (d.email) { params.push(d.email); clauses.push(`lower(e.email) = lower($${params.length})`); }
  if (d.phone) {
    params.push(d.phone.replace(/\D/g, '').slice(-10));
    clauses.push(`right(regexp_replace(e.phone, '\\D', '', 'g'), 10) = $${params.length}`);
  }
  if (d.first_name && d.last_name) {
    params.push(d.first_name, d.last_name);
    clauses.push(
      `(lower(e.first_name) = lower($${params.length - 1}) AND lower(e.last_name) = lower($${params.length}))`,
    );
  }
  if (!clauses.length) return;

  const { rows } = await query(
    `SELECT e.id, e.first_name, e.last_name, e.email, e.phone, e.status
       FROM enrollments e
      WHERE e.deleted_at IS NULL
        AND e.id <> $${params.length + 1}
        AND (${clauses.join(' OR ')})
      ORDER BY e.created_at DESC
      LIMIT 5`,
    [...params, newId],
  );
  if (!rows.length) return;

  await sendDuplicateMemberAlert({
    firstName: d.first_name,
    lastName: d.last_name,
    email: d.email,
    phone: d.phone,
    matches: rows,
    detailUrl: `${publicBaseUrl()}/admin/queue`,
  });
}

export default router;
