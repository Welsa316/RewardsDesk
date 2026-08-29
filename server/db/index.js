import '../env.js';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// Default to no TLS (works for local dev and Railway's internal network).
// Opt in via PGSSL=true or an `sslmode=require` in the connection string.
// When TLS is on, certificates are VERIFIED by default; set
// PGSSL_NO_VERIFY=true only for providers with self-signed chains.
function sslConfig() {
  if (process.env.PGSSL === 'false') return false;
  const wantsSsl =
    process.env.PGSSL === 'true' || /sslmode=require/i.test(process.env.DATABASE_URL);
  if (!wantsSsl) return false;
  return process.env.PGSSL_NO_VERIFY === 'true' ? { rejectUnauthorized: false } : true;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  // pg defaults to 10. One dashboard load takes seven (settings + six parallel
  // stat queries), so two staff opening it at once saturated the pool and a
  // third request queued behind them.
  max: Number(process.env.PGPOOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected idle Postgres client error:', err);
});

export const query = (text, params) => pool.query(text, params);

// Postgres transient/connection failures. Anything else is a real error and
// retrying it would just delay the report.
const TRANSIENT = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE',
  '57P03', // cannot_connect_now — server is starting up
  '08006', '08001', '08004', // connection failures
  '53300', // too_many_connections
]);

/**
 * Blocks until Postgres accepts a query, or gives up.
 *
 * On a fresh deploy the app container can start before the database is
 * accepting connections — and after a database restart it definitely does.
 * Without this, the very first query throws, the start command exits non-zero,
 * and the platform reports a failed deployment even though the retry seconds
 * later succeeds. That produces "deploy failed" alerts for a service that is
 * healthy, which trains everyone to ignore the alerts.
 */
export async function waitForDatabase({ attempts = 12, delayMs = 2000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      if (i > 1) console.log(`  ✓ database reachable after ${i} attempts`);
      return;
    } catch (err) {
      const code = err?.code;
      if (!TRANSIENT.has(code) || i === attempts) throw err;
      console.warn(
        `  • database not ready (${code}), retrying in ${delayMs}ms — attempt ${i}/${attempts}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// Runs `fn` inside a transaction, passing it a dedicated client.
// Commits on success, rolls back on any thrown error.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
