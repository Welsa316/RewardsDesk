import './env.js';
import bcrypt from 'bcryptjs';
import { pool, waitForDatabase } from './db/index.js';

async function seed() {
  await waitForDatabase();
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

  // This runs on EVERY deploy (railway.json chains migrate && seed && start),
  // so it must not overwrite anything the owner has since changed in the app.
  // Creating the account is idempotent; re-applying the env password is not —
  // it would silently revert a password changed in-app back to whatever is in
  // Railway, and reactivate an admin who was deliberately deactivated.
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [name, email, hash],
  );

  if (rows[0]) {
    console.log(`  ✓ admin created: ${rows[0].email} (id ${rows[0].id})`);
    return;
  }

  // Recovery hatch for a lost owner password. Explicit and one-shot: set it,
  // deploy, sign in, then remove the variable.
  if (/^(1|true|yes)$/i.test(process.env.ADMIN_FORCE_RESET || '')) {
    const { rows: reset } = await pool.query(
      `UPDATE users
          SET name = $1, password_hash = $2, role = 'admin', active = TRUE
        WHERE email = $3
        RETURNING id, email`,
      [name, hash, email],
    );
    console.warn(
      `  ⚠ ADMIN_FORCE_RESET is set — reset the password and reactivated ${reset[0].email} ` +
        '(id ' + reset[0].id + '). Remove ADMIN_FORCE_RESET from the environment now.',
    );
    return;
  }

  console.log(
    `  • admin ${email} already exists — left untouched. ` +
      'Change the password from the Staff page, or set ADMIN_FORCE_RESET=true for one deploy to reset it.',
  );
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
