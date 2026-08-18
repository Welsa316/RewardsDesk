import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/stats/dashboard — everything the dashboard needs in one round trip.
// Goal progress counts 'enrolled' records by processed_at (when credited).
// All day/month/year buckets are computed in the HOTEL's timezone
// (settings.timezone), not the DB session timezone — otherwise a record
// processed in the local evening lands in tomorrow's/next month's bucket
// on a UTC-hosted database.
router.get('/dashboard', async (req, res, next) => {
  try {
    const settings = await query(
      'SELECT monthly_goal, annual_goal, timezone FROM settings WHERE id = 1',
    );
    const tz = settings.rows[0]?.timezone || 'UTC';

    const [statusCounts, totals, trend, sources, recent, mine] = await Promise.all([
      query(
        `SELECT status, count(*)::int AS count
           FROM enrollments WHERE deleted_at IS NULL
          GROUP BY status`,
      ),

      query(
        `SELECT
           count(*) FILTER (WHERE status = 'enrolled'
             AND processed_at >= (date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1))::int AS month_enrolled,
           count(*) FILTER (WHERE status = 'enrolled'
             AND processed_at >= (date_trunc('year', now() AT TIME ZONE $1) AT TIME ZONE $1))::int  AS year_enrolled,
           count(*) FILTER (WHERE status = 'enrolled'
             AND processed_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1))::int   AS today_enrolled,
           count(*) FILTER (WHERE status = 'pending')::int                                          AS pending,
           count(*) FILTER (WHERE status = 'enrolled')::int                                         AS total_enrolled,
           count(*) FILTER (WHERE qualification = 'qualified')::int                                 AS qualified,
           count(*) FILTER (WHERE qualification = 'disqualified')::int                              AS disqualified,
           count(*) FILTER (WHERE status = 'enrolled' AND qualification IS NULL)::int               AS awaiting_review,
           count(*)::int                                                                            AS total
         FROM enrollments WHERE deleted_at IS NULL`,
        [tz],
      ),

      query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS date, count(e.id)::int AS count
           FROM generate_series(
                  (now() AT TIME ZONE $1)::date - 89,
                  (now() AT TIME ZONE $1)::date,
                  INTERVAL '1 day') d
           LEFT JOIN enrollments e
             ON e.deleted_at IS NULL AND e.status = 'enrolled'
            AND (e.processed_at AT TIME ZONE $1)::date = d::date
          GROUP BY d
          ORDER BY d`,
        [tz],
      ),

      query(
        `SELECT source, count(*)::int AS count
           FROM enrollments WHERE deleted_at IS NULL
          GROUP BY source
          ORDER BY count DESC`,
      ),

      query(
        `SELECT h.id, h.action, h.new_status, h.detail, h.changed_at, u.name AS changed_by_name,
                e.id AS enrollment_id, e.first_name, e.last_name
           FROM status_history h
           JOIN enrollments e ON e.id = h.enrollment_id
           LEFT JOIN users u ON u.id = h.changed_by
          ORDER BY h.changed_at DESC, h.id DESC
          LIMIT 12`,
      ),

      // The signed-in user's own numbers — staff see their contribution without
      // reading the whole leaderboard.
      query(
        `SELECT
           count(*) FILTER (WHERE status='enrolled'
             AND processed_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2))::int   AS today,
           count(*) FILTER (WHERE status='enrolled'
             AND processed_at >= (date_trunc('month', now() AT TIME ZONE $2) AT TIME ZONE $2))::int AS month,
           count(*) FILTER (WHERE status='enrolled'
             AND processed_at >= (date_trunc('year', now() AT TIME ZONE $2) AT TIME ZONE $2))::int  AS year,
           count(*) FILTER (WHERE status='enrolled' AND qualification='qualified')::int             AS qualified,
           (SELECT monthly_goal FROM users WHERE id = $1)                                           AS monthly_goal
         FROM enrollments
        WHERE deleted_at IS NULL AND processed_by = $1`,
        [req.user.id, tz],
      ),
    ]);

    const statusMap = {};
    for (const r of statusCounts.rows) statusMap[r.status] = r.count;

    res.json({
      goals: {
        monthly: settings.rows[0]?.monthly_goal ?? 0,
        annual: settings.rows[0]?.annual_goal ?? 0,
      },
      timezone: tz,
      totals: totals.rows[0],
      status_counts: statusMap,
      trend: trend.rows,
      sources: sources.rows,
      recent: recent.rows,
      me: { ...mine.rows[0], name: req.user.name },
    });
  } catch (err) {
    next(err);
  }
});

// Accepts a date (YYYY-MM-DD) or a full ISO timestamp. The client sends precise
// local-timezone boundary instants so comparisons don't depend on the DB timezone.
const TS_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// Express turns repeated query keys (?from=a&from=b) into arrays; normalize.
const first = (v) => (Array.isArray(v) ? v[0] : v);

// GET /api/stats/leaderboard — per-staff processed/enrolled/conversion for a
// date range. The client sends precise local-timezone boundary instants, so the
// range matches the viewer's calendar regardless of the DB timezone. A missing
// bound is unbounded (so no range = all-time). Every active staff/admin appears
// (including those with zero) so the screen doubles as an accountability view.
router.get('/leaderboard', async (req, res, next) => {
  try {
    const rawFrom = first(req.query.from);
    const rawTo = first(req.query.to);
    const from = TS_RE.test(rawFrom || '') ? rawFrom : null;
    const to = TS_RE.test(rawTo || '') ? rawTo : null;

    const { rows: settingsRows } = await query('SELECT timezone FROM settings WHERE id = 1');
    const tz = settingsRows[0]?.timezone || 'UTC';

    // $1 is always the hotel timezone; range bounds follow.
    const joinConds = ['e.processed_by = u.id', 'e.deleted_at IS NULL'];
    const params = [tz];
    if (from) {
      params.push(from);
      joinConds.push(`e.processed_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      joinConds.push(`e.processed_at < $${params.length}::timestamptz`);
    }

    // Today/MTD/YTD are fixed hotel-calendar buckets, so they come from
    // correlated subqueries rather than the range-filtered join.
    const bucket = (unit) =>
      `(SELECT count(*) FROM enrollments x
         WHERE x.processed_by = u.id AND x.deleted_at IS NULL AND x.status = 'enrolled'
           AND x.processed_at >= (date_trunc('${unit}', now() AT TIME ZONE $1) AT TIME ZONE $1))::int`;

    const { rows } = await query(
      `SELECT u.id, u.name, u.monthly_goal,
              count(e.id)::int AS processed,
              count(e.id) FILTER (WHERE e.status = 'enrolled')::int AS enrolled,
              count(e.id) FILTER (WHERE e.qualification = 'qualified')::int AS qualified,
              ${bucket('day')} AS today,
              ${bucket('month')} AS month_enrolled,
              ${bucket('year')} AS year_enrolled
         FROM users u
         LEFT JOIN enrollments e ON ${joinConds.join(' AND ')}
        WHERE u.role IN ('admin', 'staff') AND u.active = TRUE
        GROUP BY u.id, u.name, u.monthly_goal
        ORDER BY enrolled DESC, processed DESC, u.name ASC`,
      params,
    );

    res.json({
      from,
      to,
      timezone: tz,
      rows: rows.map((r) => ({
        ...r,
        conversion: r.processed ? Math.round((r.enrolled / r.processed) * 100) : 0,
        goal_pct: r.monthly_goal ? Math.round((r.month_enrolled / r.monthly_goal) * 100) : null,
        goal_remaining: r.monthly_goal ? Math.max(0, r.monthly_goal - r.month_enrolled) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
