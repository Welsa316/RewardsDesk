import { query } from '../db/index.js';
import { emailEnabled, sendExpirationReminder } from './email.js';
import { publicBaseUrl } from './stripe.js';
import { getSettings } from './settings.js';

// How often the sweeper looks for sessions about to expire. The lead time
// itself is the admin's configured "expiring soon" window, so the reminder and
// the status pill agree about what "soon" means.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let timer = null;

/**
 * Claims and emails reminders for sessions about to run out.
 *
 * The claim is a single UPDATE ... RETURNING over a SKIP LOCKED select, so two
 * app instances can run this at the same time and a guest still receives one
 * reminder. Marking the row before sending makes this at-most-once: a crash
 * mid-send loses a reminder, which is far better than emailing a guest twice.
 */
export async function sweepExpiryReminders() {
  if (!emailEnabled()) return 0;

  const settings = await getSettings();
  const leadMinutes = Number(settings.parking_expiring_soon_minutes) || 60;
  const tz = settings.timezone || 'UTC';
  const brandName = settings.parking_brand_name || settings.hotel_name || 'Guest Parking';

  const { rows } = await query(
    `UPDATE parking_sessions
        SET expiry_reminder_sent_at = now()
      WHERE id IN (
        SELECT id FROM parking_sessions
         WHERE disposition = 'active'
           AND kind <> 'comp'
           AND email IS NOT NULL AND email <> ''
           AND expiry_reminder_sent_at IS NULL
           AND paid_through > now()
           AND paid_through <= now() + ($1 || ' minutes')::interval
         ORDER BY paid_through
         FOR UPDATE SKIP LOCKED
         LIMIT 50
      )
      RETURNING id, email, confirmation_code, plate, plate_state, paid_through, status_token`,
    [String(leadMinutes)],
  );

  if (!rows.length) return 0;
  const base = publicBaseUrl();
  let sent = 0;

  for (const s of rows) {
    try {
      const ok = await sendExpirationReminder({
        to: s.email,
        brandName,
        confirmationCode: s.confirmation_code,
        plate: s.plate,
        plateState: s.plate_state,
        paidThrough: s.paid_through,
        statusUrl: s.status_token ? `${base}/park/s/${s.status_token}` : null,
        timeZone: tz,
      });
      if (ok) sent++;
    } catch (err) {
      // Never let one bad address stop the rest of the batch.
      console.error(`expiry reminder failed for session ${s.id}:`, err?.message || err);
    }
  }
  if (sent) console.log(`  ✓ sent ${sent} parking expiry reminder(s)`);
  return sent;
}

/** Starts the periodic sweep. No-op when email is not configured. */
export function startExpiryReminders() {
  if (timer) return;
  if (!emailEnabled()) {
    console.log('  • expiry reminders idle — RESEND_API_KEY / EMAIL_FROM not set');
    return;
  }
  const run = () =>
    sweepExpiryReminders().catch((err) =>
      console.error('expiry reminder sweep failed:', err?.message || err),
    );
  timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.(); // never hold the process open on shutdown
  run();
  console.log(`  ✓ expiry reminders running every ${SWEEP_INTERVAL_MS / 60000} min`);
}

export function stopExpiryReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}
