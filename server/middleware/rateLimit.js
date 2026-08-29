import rateLimit from 'express-rate-limit';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Every guest on the property's wifi shares one egress IP, so an hourly cap
// keyed on IP throttles the hotel rather than an abuser — the 21st car of the
// hour was refused having never tried, and told it was "too many attempts from
// this network". The hourly windows are keyed on something specific to the
// guest instead (their own plate or phone); IP stays as the fallback for a
// request that carries neither, and the short burst windows stay on IP because
// a per-minute ceiling is about hammering, not volume.
function guestKey(...fields) {
  return (req) => {
    for (const f of fields) {
      const v = req.body?.[f];
      if (typeof v === 'string' && v.trim()) return `${f}:${v.trim().toLowerCase()}`;
    }
    // Normalising to a /64 keeps a single IPv6 client from getting a fresh
    // bucket per address.
    const ip = req.ip || '';
    return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
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
