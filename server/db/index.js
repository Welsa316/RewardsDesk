import '../env.js';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// Default to no TLS (works for local dev and Railway's internal network).
// Opt in via PGSSL=true or an `sslmode=require` in the connection string,
// which is what most external managed Postgres providers need.
function sslConfig() {
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return { rejectUnauthorized: false };
  if (/sslmode=require/i.test(process.env.DATABASE_URL)) return { rejectUnauthorized: false };
  return false;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
});

pool.on('error', (err) => {
  console.error('Unexpected idle Postgres client error:', err);
});

export const query = (text, params) => pool.query(text, params);

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
