import { Resend } from 'resend';

// Notification email. Three rules govern everything in this file:
//
// 1. A failed send must NEVER fail the thing that triggered it. A guest whose
//    parking payment succeeded is parked, whether or not the receipt arrived.
// 2. Nothing here carries a hotel logo or chain branding — these reach guests.
// 3. SKIP_EMAIL=true logs instead of sending, so local work and tests never
//    hit the API or mail a real person.

const ADMIN_ALERT_TO = 'bwpairport189@gmail.com';

let client = null;

function resend() {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

function skipping() {
  return /^(1|true|yes)$/i.test(process.env.SKIP_EMAIL || '');
}

/** True when email is actually configured — used to log a clear reason once. */
export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sends one email. Returns true when it was accepted, false otherwise.
 * Never throws — every caller is on a path where the user's real work has
 * already succeeded.
 */
export async function sendEmail({ to, subject, html }) {
  try {
    if (!to) return false;

    if (skipping()) {
      console.log(`  ✉ [SKIP_EMAIL] would send "${subject}" to ${to}`);
      return true;
    }
    if (!emailEnabled()) {
      console.warn(`  ✉ skipped "${subject}" — RESEND_API_KEY / EMAIL_FROM not set.`);
      return false;
    }

    const { error } = await resend().emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) {
      console.error(`  ✉ failed to send "${subject}" to ${to}:`, error.message || error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`  ✉ failed to send "${subject}":`, err?.message || err);
    return false;
  }
}

// ── Templates ─────────────────────────────────────────────────────────────
// Deliberately plain: inline styles only, no images, no logos, no external
// assets. Mail clients strip most of it anyway and these need to be legible
// in a preview pane.

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function layout(heading, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FBF8F3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F1B2D">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E8DDD0;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${escapeHtml(heading)}</h1>
    ${bodyHtml}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#4A5568;text-align:center">
    Each BWH Hotels branded hotel is independently owned and operated.
  </p>
</body></html>`;
}

function rows(pairs) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#4A5568">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>`;
}

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

function when(value, timeZone) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

// ── One function per notification ─────────────────────────────────────────

/** Receipt for a paid parking session. Skipped silently when we have no email. */
export function sendParkingReceipt({ to, brandName, confirmationCode, plate, plateState, amountCents, startsAt, paidThrough, statusUrl, timeZone }) {
  if (!to) return Promise.resolve(false);
  const brand = brandName || 'Guest Parking';
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      Your parking is paid. Keep this for your records.
    </p>
    ${rows([
      ['Confirmation', confirmationCode],
      ['Vehicle', plateState ? `${plate} · ${plateState}` : plate],
      ['Amount paid', money(amountCents)],
      ['Starts', when(startsAt, timeZone)],
      ['Paid through', when(paidThrough, timeZone)],
    ])}
    ${
      statusUrl
        ? `<p style="margin:20px 0 0"><a href="${escapeHtml(statusUrl)}" style="display:inline-block;background:#0F1B2D;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">Check your time or add more</a></p>`
        : ''
    }`;
  return sendEmail({ to, subject: `${brand} — receipt for ${plate}`, html: layout(`${brand} receipt`, body) });
}

/** Confirmation to a guest who submitted the rewards enrollment form. */
export function sendEnrollmentConfirmation({ to, firstName }) {
  if (!to) return Promise.resolve(false);
  const body = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      ${firstName ? `Thanks, ${escapeHtml(firstName)}.` : 'Thanks.'} We've received your rewards
      enrollment details.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.5;color:#4A5568">
      Stop by the front desk at check-in and we'll finish setting up your account so you start
      earning points. There's nothing else you need to do right now.
    </p>`;
  return sendEmail({ to, subject: 'We got your rewards enrollment', html: layout("You're on the list", body) });
}

/** Internal alert so the owner sees enrollments arriving without watching the queue. */
export function sendEnrollmentAdminAlert({ firstName, lastName, email, phone, source, queueUrl }) {
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Someone';
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">A new rewards enrollment just came in.</p>
    ${rows([
      ['Name', name],
      ['Email', email || '—'],
      ['Phone', phone || '—'],
      ['Source', source || '—'],
    ])}
    ${
      queueUrl
        ? `<p style="margin:20px 0 0"><a href="${escapeHtml(queueUrl)}" style="display:inline-block;background:#0F1B2D;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">Open the queue</a></p>`
        : ''
    }`;
  return sendEmail({
    to: ADMIN_ALERT_TO,
    subject: `New rewards enrollment — ${name}`,
    html: layout('New rewards enrollment', body),
  });
}
