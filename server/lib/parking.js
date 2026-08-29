// Parking domain logic: pricing, durations, confirmation codes, and the ONE
// derived-status SQL fragment shared by every query that reports a session's
// display status (guest page, staff list, dashboard must never disagree).
import crypto from 'node:crypto';

export const DAILY_MIN = 1;
export const DAILY_MAX = 14;

// Parking is sold by the day only. Hourly is no longer offered, but sessions
// sold under it still exist, so the rate_type column and its 'hourly' value
// stay readable — this just refuses to price a new one.
export const SELLABLE_RATE_TYPES = ['daily'];

// The sole price authority. Client-sent amounts are never trusted anywhere.
// Returns integer cents, or null for an invalid rate/quantity combination.
// `rates.parking_daily_cents` is the effective rate for the day, which the
// caller resolves through activeDailyRate() so a promo is applied consistently.
/**
 * Tax on a subtotal, in cents.
 *
 * Basis points rather than a percentage float: 20% is the integer 2000, so the
 * arithmetic is exact and a rate can never arrive as 19.999999. Rounded half up
 * on the tax itself rather than on the total, so a line and its parts always
 * reconcile.
 */
export function taxCents(subtotalCents, taxBps) {
  const bps = Number(taxBps) || 0;
  if (bps <= 0) return 0;
  return Math.round((Number(subtotalCents) * bps) / 10000);
}

/** Subtotal, tax and total for a quantity of days. */
export function priceBreakdown(rateType, quantity, rates, taxBps) {
  const subtotal = priceCents(rateType, quantity, rates);
  if (subtotal === null) return null;
  const tax = taxCents(subtotal, taxBps);
  return { subtotal, tax, total: subtotal + tax };
}

export function priceCents(rateType, quantity, rates) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty)) return null;
  if (rateType !== 'daily') return null;
  if (qty < DAILY_MIN || qty > DAILY_MAX) return null;
  return qty * rates.parking_daily_cents;
}

export function durationHours(rateType, quantity) {
  // 'hourly' remains only for historical sessions sold before daily-only.
  return rateType === 'daily' ? Number(quantity) * 24 : Number(quantity);
}

export function durationLabel(rateType, quantity) {
  const qty = Number(quantity);
  if (rateType === 'daily') return `${qty} day${qty === 1 ? '' : 's'}`;
  return `${qty} hour${qty === 1 ? '' : 's'}`;
}

// Confirmation codes: P- + 6 chars from an alphabet with no I/L/O/0/1, so the
// code survives handwriting and phone calls. ~1.07B combinations.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateConfirmationCode() {
  let code = 'P-';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Display-status CASE expression for SQL queries. `expMinutes` comes from
// settings (server-side, validated) and is interpolated as a checked integer
// to keep the fragment free of bind-parameter position coupling.
export function derivedStatusSql(alias, expMinutes) {
  const exp = Number.isInteger(Number(expMinutes)) && Number(expMinutes) > 0 ? Number(expMinutes) : 60;
  const a = alias;
  return `CASE
    WHEN ${a}.disposition = 'pending_payment' THEN 'pending_payment'
    WHEN ${a}.disposition = 'canceled' THEN 'canceled'
    WHEN ${a}.disposition = 'departed' THEN 'departed'
    WHEN ${a}.paid_through IS NULL THEN 'pending_payment'
    WHEN now() > ${a}.paid_through THEN 'expired'
    WHEN ${a}.kind = 'comp' THEN 'complimentary'
    WHEN now() > ${a}.paid_through - make_interval(mins => ${exp}) THEN 'expiring_soon'
    ELSE 'active'
  END`;
}

// Statuses that occupy a physical space (drive the capacity math).
export const OCCUPYING_SQL = (alias) =>
  `${alias}.disposition = 'active'`;
