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

    const [statusCounts, totals, trend, sources, recent] = await Promise.all([
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
        `SELECT h.id, h.new_status, h.changed_at, u.name AS changed_by_name,
                e.id AS enrollment_id, e.first_name, e.last_name
           FROM status_history h
           JOIN enrollments e ON e.id = h.enrollment_id
           LEFT JOIN users u ON u.id = h.changed_by
          ORDER BY h.changed_at DESC, h.id DESC
          LIMIT 10`,
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

    const joinConds = ['e.processed_by = u.id', 'e.deleted_at IS NULL'];
    const params = [];
    if (from) {
      params.push(from);
      joinConds.push(`e.processed_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      joinConds.push(`e.processed_at < $${params.length}::timestamptz`);
    }

    const { rows } = await query(
      `SELECT u.id, u.name,
              count(e.id)::int AS processed,
              count(e.id) FILTER (WHERE e.status = 'enrolled')::int AS enrolled
         FROM users u
         LEFT JOIN enrollments e ON ${joinConds.join(' AND ')}
        WHERE u.role IN ('admin', 'staff') AND u.active = TRUE
        GROUP BY u.id, u.name
        ORDER BY enrolled DESC, processed DESC, u.name ASC`,
      params,
    );

    res.json({
      from,
      to,
      rows: rows.map((r) => ({
        ...r,
        conversion: r.processed ? Math.round((r.enrolled / r.processed) * 100) : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
