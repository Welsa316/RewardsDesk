import rateLimit from 'express-rate-limit';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Normalising to a /64 keeps a single IPv6 client from getting a fresh bucket
// per address.
function ipKey(req) {
  const ip = req.ip || '';
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
}

// Every guest on the property's wifi shares one egress IP, so a tight hourly
// cap keyed on IP throttles the hotel rather than an abuser — the 21st car of
// the hour was refused having never tried. So the tight hourly window is keyed
// on something specific to the guest (their own plate or phone).
//
// That key alone is not a cap, though: it comes out of the request body, so a
// caller who varies the field gets a brand-new bucket every time and the
// hourly window stops existing. That is how an unauthenticated caller could
// drive ~28k enrollment emails a day out of our verified sending domain. Each
// identifier-keyed window is now paired with a loose per-IP window (see
// *PerHourPerIp below): generous enough that a whole property behind one NAT
// never notices, tight enough that a single host cannot sit on the endpoint.
function guestKey(...fields) {
  return (req) => {
    for (const f of fields) {
      const v = req.body?.[f];
      if (typeof v === 'string' && v.trim()) return `${f}:${v.trim().toLowerCase()}`;
    }
    return ipKey(req);
  };
}

// Public intake is the only unauthenticated write, so it gets two windows.
export const intakePerMinute = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 20, // shared NAT: this is a burst guard, not a usage cap
  message: { error: 'Too many submissions. Please wait a minute and try again.' },
});

export const intakePerHour = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: guestKey('email', 'phone'),
  message: { error: "You've already submitted this a few times — see the front desk and we'll finish it there." },
});

// The volume ceiling the identifier-keyed window above cannot enforce, because
// the caller chooses that identifier. Sized for a busy property behind one NAT,
// not for a single guest. (A CAPTCHA is the real answer to a determined
// distributed abuser; this closes the single-host case.)
export const intakePerHourPerIp = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: ipKey,
  message: { error: 'Too many submissions from this network. Please see the front desk.' },
});

// Modest brute-force guard on login.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Public parking checkout — creates DB rows + Stripe sessions, so keep tight.
export const parkingCheckoutPerMinute = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 20, // shared NAT: burst guard only
  message: { error: 'Too many attempts. Please wait a minute and try again.' },
});

export const parkingCheckoutPerHour = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 8, // per car/phone — plenty for a genuine guest paying and extending
  keyGenerator: guestKey('plate', 'phone'),
  message: { error: "That's several payment attempts for this vehicle — please see the front desk." },
});

export const parkingCheckoutPerHourPerIp = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: ipKey,
  message: { error: 'Too many payment attempts from this network. Please see the front desk.' },
});

// The extend body carries only a duration — no plate, no phone — so
// guestKey() found nothing and fell through to the IP. That put the whole
// property's wifi in one bucket of 8/hour: the ninth guest of the hour adding
// time to their own parking was told it was "several payment attempts for this
// vehicle", having made none. The token in the URL is the per-guest key here.
export const parkingExtendPerHour = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyGenerator: (req) => `ext:${req.params?.token || ipKey(req)}`,
  message: { error: "That's several payment attempts for this vehicle — please see the front desk." },
});

// Inbound SMS. Every request arrives from Twilio's own IPs, so an IP key would
// bucket the whole world together — key on the sending phone number instead.
// Carriers require HELP to be answered every time, and STOP to always be
// honoured — throttling either is a compliance failure, not just poor service.
// They are cheap and self-limiting, so they skip the window entirely.
const ALWAYS_ANSWER = new Set([
  'HELP', 'INFO',
  'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'START', 'UNSTOP',
]);

export const smsInboundPerMinute = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 6,
  keyGenerator: (req) => `sms:${String(req.body?.From || req.ip || '').slice(-16)}`,
  skip: (req) =>
    ALWAYS_ANSWER.has(String(req.body?.Body || '').trim().toUpperCase().replace(/[^A-Z]/g, '')),
  // A flooding sender gets silence rather than an error message — an error
  // would just be one more message back at them.
  handler: (req, res) => res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<Response/>'),
});

// Guest status lookups are cheap reads; this just slows token scanning.
// Status reads are per-token, not per-IP: a whole lot full of guests checking
// their time shares one wifi IP, and being locked out of the page that proves
// you paid is exactly the wrong failure.
export const parkingStatusLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `tok:${req.params?.token || req.ip || ''}`,
  message: { error: 'Checking a little too often — wait a moment and refresh.' },
});
