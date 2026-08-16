import './env.js';
import bcrypt from 'bcryptjs';
import { pool } from './db/index.js';

async function seed() {
  // Always ensure the singleton settings row exists (column defaults fill the rest).
  await pool.query('INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;');
  console.log('  ✓ settings row ensured');

  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  // Runs on every deploy — skip gracefully (don't fail startup) if the admin
  // env vars aren't all set.
  if (!name || !email || !password) {
    console.warn('  • Skipping admin seed — ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD are not all set.');
    return;
  }

  // In production, refuse to (re)apply a known-default or weak owner password —
  // the repo is public, so example values are public too. The existing admin
  // row is left untouched; set a strong ADMIN_PASSWORD and redeploy.
  const KNOWN_DEFAULTS = new Set(['change-me-now', 'changeme', 'password', 'admin123']);
  if (
    process.env.NODE_ENV === 'production' &&
    (KNOWN_DEFAULTS.has(password) || /replace[_-]?me/i.test(password) || password.length < 10)
  ) {
    console.warn(
      '  ⚠ Skipping admin seed — ADMIN_PASSWORD is a known default or under 10 characters. ' +
        'Set a strong ADMIN_PASSWORD in the environment and redeploy.',
    );
    return;
  }

  // Upsert the admin. Re-running resets the admin to the current env values,
  // keeping the owner login in sync with the deploy config.
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = 'admin',
           active = TRUE
     RETURNING id, email`,
    [name, email, hash],
  );
  console.log(`  ✓ admin ready: ${rows[0].email} (id ${rows[0].id})`);
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
