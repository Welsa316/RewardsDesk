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
      const rt = (process.env.EMAIL_REPLY_TO || '').trim() || ADMIN_ALERT_TO;
      console.log(`  ✉ [SKIP_EMAIL] would send "${subject}" to ${to} (reply-to ${rt})`);
      return true;
    }
    if (!emailEnabled()) {
      console.warn(`  ✉ skipped "${subject}" — RESEND_API_KEY / EMAIL_FROM not set.`);
      return false;
    }

    // Reply-To matters more than it looks. EMAIL_FROM only has to sit on a
    // domain verified in Resend — the mailbox behind it need not exist for
    // sending to work. But a guest who hits Reply on a parking receipt then
    // gets a bounce, or silence. Pointing replies at an inbox someone actually
    // reads keeps the branded sender without that dead end.
    const replyTo = (process.env.EMAIL_REPLY_TO || '').trim() || ADMIN_ALERT_TO;

    const { error } = await resend().emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
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

/** Refund confirmation to the guest whose card was refunded. */
export function sendRefundNotice({ to, brandName, confirmationCode, plate, plateState, amountCents, isFullRefund, reason, method, timeZone, refundedAt }) {
  if (!to) return Promise.resolve(false);
  const brand = brandName || 'Guest Parking';
  // Cash and card-terminal refunds are handed over at the desk; saying "to your
  // card" for those would have the guest watching a statement that never moves.
  const settlement =
    method === 'stripe'
      ? 'This has been refunded to the card you paid with. It can take a few business days to appear on your statement.'
      : 'This was refunded at the front desk.';
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      We've refunded ${isFullRefund ? 'your parking payment' : 'part of your parking payment'}.
    </p>
    ${rows([
      ['Confirmation', confirmationCode],
      ['Vehicle', plateState ? `${plate} · ${plateState}` : plate],
      ['Amount refunded', money(amountCents)],
      ['Reason', reason],
      ['Refunded', when(refundedAt, timeZone)],
    ])}
    <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#4A5568">${settlement}</p>`;
  return sendEmail({
    to,
    subject: `${brand} — ${money(amountCents)} refunded`,
    html: layout(`${brand} refund`, body),
  });
}

/** Heads-up that a guest's parking runs out shortly. */
export function sendExpirationReminder({ to, brandName, confirmationCode, plate, plateState, paidThrough, statusUrl, timeZone }) {
  if (!to) return Promise.resolve(false);
  const brand = brandName || 'Guest Parking';
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      Your parking runs out soon. If you're staying longer, add time before it expires to avoid
      additional charges.
    </p>
    ${rows([
      ['Confirmation', confirmationCode],
      ['Vehicle', plateState ? `${plate} · ${plateState}` : plate],
      ['Expires', when(paidThrough, timeZone)],
    ])}
    ${
      statusUrl
        ? `<p style="margin:20px 0 0"><a href="${escapeHtml(statusUrl)}" style="display:inline-block;background:#680018;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">Add more time</a></p>`
        : ''
    }
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4A5568">
      Already left? You can ignore this.
    </p>`;
  return sendEmail({
    to,
    subject: `${brand} — parking for ${plate} expires soon`,
    html: layout('Your parking expires soon', body),
  });
}

/**
 * Internal alert that an enrollment matches someone already on file.
 *
 * Goes to the desk rather than the guest: they cannot act on it, and telling
 * someone they are a duplicate reads badly. The desk checks the loyalty
 * terminal before enrolling again.
 */
export function sendDuplicateMemberAlert({ firstName, lastName, email, phone, matches, detailUrl }) {
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Someone';
  const list = (matches || [])
    .slice(0, 5)
    .map(
      (m) =>
        `<li style="margin:4px 0">${escapeHtml(
          [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Unnamed',
        )}${m.email ? ` — ${escapeHtml(m.email)}` : ''}${m.phone ? ` — ${escapeHtml(m.phone)}` : ''}` +
        `${m.status ? ` <span style="color:#4A5568">(${escapeHtml(m.status)})</span>` : ''}</li>`,
    )
    .join('');
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      <strong>${escapeHtml(name)}</strong> just submitted a rewards enrollment that matches
      ${(matches || []).length === 1 ? 'an existing record' : 'existing records'}.
      Check the loyalty terminal before enrolling them again.
    </p>
    ${rows([
      ['Submitted email', email],
      ['Submitted phone', phone],
    ])}
    <p style="margin:16px 0 6px;font-size:14px;font-weight:600">Possible matches</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;color:#0F1B2D">${list}</ul>
    ${
      detailUrl
        ? `<p style="margin:20px 0 0"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#0F1B2D;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">Open the queue</a></p>`
        : ''
    }`;
  return sendEmail({
    to: ADMIN_ALERT_TO,
    subject: `Possible duplicate enrollment — ${name}`,
    html: layout('Possible duplicate member', body),
  });
}
