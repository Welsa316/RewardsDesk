import { Router } from 'express';
import express from 'express';
import { query } from '../db/index.js';
import { publicBaseUrl } from '../lib/stripe.js';
import {
  twilioEnabled,
  verifyTwilioSignature,
  signedUrlFor,
  twimlMessage,
  twimlEmpty,
} from '../lib/twilio.js';
import { smsInboundPerMinute } from '../middleware/rateLimit.js';

const router = Router();

const HELP_TEXT =
  'Pay to Park: text PARK for a link to pay for parking. Msg & data rates may apply. Reply STOP to opt out. Help: bwpairport189@gmail.com';

// Twilio posts form-encoded, so this router parses its own body rather than
// relying on the global JSON parser.
router.use(express.urlencoded({ extended: false, limit: '32kb' }));

/**
 * Inbound SMS from Twilio.
 *
 * Always answers 200 with TwiML — a non-2xx makes Twilio retry and log an
 * error, and there is nothing a guest gains from that. Failures reply with
 * something useful instead.
 */
/**
 * Signature check, as middleware so it runs BEFORE the rate limiter.
 *
 * The limiter keys on the From number, so if it ran first anyone could POST
 * forged requests carrying a guest's number and burn that guest's quota
 * without ever holding a valid signature. Verifying first means only messages
 * Twilio actually sent can consume anyone's allowance.
 */
function requireTwilioSignature(req, res, next) {
  const ok = verifyTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    signature: req.get('x-twilio-signature'),
    url: signedUrlFor(req, publicBaseUrl()),
    params: req.body,
  });
  // 403 with no body — a forged request gets nothing back.
  if (!ok) return res.status(403).type('text/plain').send('Invalid signature');
  return next();
}

router.post('/sms/twilio', requireTwilioSignature, smsInboundPerMinute, async (req, res) => {
  const body = String(req.body?.Body || '').trim();
  const keyword = body.toUpperCase().replace(/[^A-Z]/g, '');
  const from = String(req.body?.From || '').trim();

  try {
    // Twilio handles STOP/START/UNSTOP itself and suppresses further messages;
    // replying here would either be dropped or double up on its confirmation.
    if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'START', 'UNSTOP'].includes(keyword)) {
      return res.type('text/xml').send(twimlEmpty());
    }
    if (keyword === 'HELP' || keyword === 'INFO') {
      return res.type('text/xml').send(twimlMessage(HELP_TEXT));
    }

    const base = publicBaseUrl();

    // Every outbound reply carries this. The consent language Twilio verified
    // us against promises it on the message a request produces, so a reply
    // without it is a compliance gap, not a style choice — and the returning
    // guest reply and the error fallback below were both missing it.
    const OPT_OUT = '\nReply STOP to opt out, HELP for help.';

    // If this number already has a car on the lot, send them back to it rather
    // than to a blank form — that is how a guest recovers a lost link, and it
    // stops them paying twice for the same vehicle.
    const existing = await activeSessionForPhone(from);
    if (existing) {
      return res.type('text/xml').send(
        twimlMessage(
          `${existing.plate} is already parked, paid through ${existing.paidThrough}. ` +
            `Check your time or add more: ${base}/park/s/${existing.status_token}` +
            OPT_OUT,
        ),
      );
    }

    // Anything else — including PARK itself and a plain "hi" — gets the link.
    // Being strict about the keyword only helps someone who typed it wrong.
    const link = from ? `${base}/park?phone=${encodeURIComponent(from)}` : `${base}/park`;
    return res.type('text/xml').send(
      twimlMessage(`Pay for parking here: ${link}${OPT_OUT}`),
    );
  } catch (err) {
    console.error('sms webhook failed:', err?.message || err);
    // Still a useful reply: the generic link always works.
    return res
      .type('text/xml')
      .send(
        twimlMessage(
          `Pay for parking here: ${publicBaseUrl()}/park` +
            '\nReply STOP to opt out, HELP for help.',
        ),
      );
  }
});

/**
 * The most recent still-running session for a phone number.
 * Compares on the last 10 digits so +15045551234, (504) 555-1234 and
 * 5045551234 all match the same guest.
 */
async function activeSessionForPhone(from) {
  const digits = String(from).replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return null;
  const { rows } = await query(
    `SELECT ps.status_token, ps.plate, ps.paid_through, s.timezone
       FROM parking_sessions ps CROSS JOIN settings s
      WHERE s.id = 1
        AND right(regexp_replace(ps.phone, '\\D', '', 'g'), 10) = $1
        AND ps.disposition = 'active'
        AND ps.paid_through > now()
      ORDER BY ps.paid_through DESC
      LIMIT 1`,
    [digits],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    status_token: r.status_token,
    plate: r.plate,
    paidThrough: new Intl.DateTimeFormat('en-US', {
      timeZone: r.timezone || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(r.paid_through)),
  };
}

/** Surfaced on the health check so a misconfiguration is visible. */
export { twilioEnabled };
export default router;
