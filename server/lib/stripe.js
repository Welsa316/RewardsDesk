// Lazy Stripe client. The app must boot (and the rewards side must work)
// without a key; parking payment endpoints fail with a clear 503 instead.
import Stripe from 'stripe';

let client = null;

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('Payments are not configured yet. Please try again later.');
    err.status = 503;
    throw err;
  }
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

// Base origin for Stripe success/cancel URLs.
export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .replace(/\/+$/, '');
}
