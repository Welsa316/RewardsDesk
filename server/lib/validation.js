// Small, dependency-free validation/sanitization helpers.

export function cleanStr(value, max = 255) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Accepts most international formats; just checks the digit count is sane.
export function isPhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function asBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}
