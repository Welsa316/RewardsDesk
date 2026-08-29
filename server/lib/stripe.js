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

/**
 * How a priced line should be presented to Stripe.
 *
 * With a tax rate configured, Stripe is sent the pre-tax amount and told the
 * rate, so it computes the tax itself, shows it as its own line at checkout and
 * itemises it on the receipt — and its reporting counts it as tax rather than
 * revenue.
 *
 * Without one, the tax is folded into the unit amount instead. The guest is
 * charged exactly the same either way; they just do not see it broken out. That
 * fallback matters: if the app has a tax rate and Stripe does not, sending the
 * pre-tax amount alone would silently undercharge every online guest.
 */
export function stripeLineAmount(price) {
  const taxRateId = (process.env.STRIPE_TAX_RATE_ID || '').trim();
  if (taxRateId && price.tax > 0) {
    return { unitAmount: price.subtotal, taxRates: [taxRateId] };
  }
  return { unitAmount: price.total, taxRates: null };
}

export function stripeTaxRateConfigured() {
  return Boolean((process.env.STRIPE_TAX_RATE_ID || '').trim());
}
