import './env.js';
import bcrypt from 'bcryptjs';
import { pool } from './db/index.js';

async function seed() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      'ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set to seed an admin.',
    );
  }

  // Ensure the singleton settings row exists (column defaults fill the rest).
  await pool.query('INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;');

  // Upsert the admin. Re-running seed resets the admin password to the env
  // value, which is a convenient recovery path for a forgotten owner password.
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

  console.log('  ✓ settings row ensured');
  console.log(`  ✓ admin ready: ${rows[0].email} (id ${rows[0].id})`);
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
