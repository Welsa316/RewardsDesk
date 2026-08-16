import rateLimit from 'express-rate-limit';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Public intake is the only unauthenticated write, so it gets two windows.
export const intakePerMinute = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many submissions. Please wait a minute and try again.' },
});

export const intakePerHour = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many submissions from this network. Please try again later.' },
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
  max: 5,
  message: { error: 'Too many attempts. Please wait a minute and try again.' },
});

export const parkingCheckoutPerHour = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts from this network. Please try again later.' },
});

// Guest status lookups are cheap reads; this just slows token scanning.
export const parkingStatusLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
});
