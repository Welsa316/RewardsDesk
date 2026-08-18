import { cleanStr } from './validation.js';

export const STATUSES = ['pending', 'enrolled', 'declined', 'already_member', 'duplicate'];

// Outcome reported back by Best Western, tracked separately from the desk status.
export const QUALIFICATIONS = ['qualified', 'disqualified'];

export const SORT_COLUMNS = {
  created_at: 'e.created_at',
  updated_at: 'e.updated_at',
  last_name: 'e.last_name',
  status: 'e.status',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Express turns repeated query keys (?status=a&status=b) into arrays; use the
// first value so filters stay well-typed strings.
const first = (v) => (Array.isArray(v) ? v[0] : v);

// Builds a parameterized WHERE clause shared by the list and CSV export.
export function buildListQuery(raw) {
  const q = {
    status: first(raw.status),
    source: first(raw.source),
    q: first(raw.q),
    from: first(raw.from),
    to: first(raw.to),
    qualification: first(raw.qualification),
  };
  const where = ['e.deleted_at IS NULL'];
  const params = [];

  if (q.status && STATUSES.includes(q.status)) {
    params.push(q.status);
    where.push(`e.status = $${params.length}`);
  }
  if (q.qualification === 'unreviewed') {
    where.push(`(e.status = 'enrolled' AND e.qualification IS NULL)`);
  } else if (QUALIFICATIONS.includes(q.qualification)) {
    params.push(q.qualification);
    where.push(`e.qualification = $${params.length}`);
  }
  if (q.source) {
    params.push(cleanStr(q.source, 40));
    where.push(`e.source = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${cleanStr(q.q, 100)}%`);
    const i = params.length;
    where.push(
      `(e.first_name ILIKE $${i} OR e.last_name ILIKE $${i} ` +
        `OR (e.first_name || ' ' || e.last_name) ILIKE $${i} ` +
        `OR e.email ILIKE $${i} OR e.phone ILIKE $${i})`,
    );
  }
  if (q.from && DATE_RE.test(q.from)) {
    params.push(q.from);
    where.push(`e.created_at >= $${params.length}`);
  }
  if (q.to && DATE_RE.test(q.to)) {
    params.push(q.to);
    where.push(`e.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  return { whereSql: where.join(' AND '), params };
}
