# RewardsDesk

A guest-intake and enrollment-tracking web app for a hotel front desk.

RewardsDesk is an **intake + tracking layer that sits next to** the real Best Western
Rewards enrollment — it does **not** enroll anyone itself. Guests submit their details
(with as little typing as possible via browser autofill and prefilled links); each
submission lands in a front-desk worklist; the agent copies the details into the hotel's
own Best Western terminal to do the real, property-credited enrollment, then marks the
record and gets attributed for it. The owner sees goal progress, trends, source breakdown,
and a per-agent leaderboard.

> **It deliberately does NOT** enroll anyone in Best Western Rewards, connect to/scrape any
> Best Western or Canary system, or pretend to be the official enrollment. There is no public
> BW API; the front desk completes the real enrollment on the BW terminal.

## Stack

- **Frontend:** Vue 3 (`<script setup>`) + Vite + Tailwind + Pinia. PWA (`vite-plugin-pwa`).
- **Backend:** Express + `pg` (raw SQL, no ORM) + PostgreSQL.
- **Auth:** JWT in an httpOnly cookie. Roles: `admin` (owner) and `staff` (front desk).
- **Deploy:** Railway, single service — in production Express serves the built client.

## Project structure

```
/client          Vue 3 + Vite frontend
/server          Express API
  /db            pg pool
  /migrations    raw SQL migrations (run in filename order)
  /routes        (added from Phase 2 on)
  /middleware    (added from Phase 2 on)
  migrate.js     applies pending migrations
  seed.js        creates the admin + settings row from env
package.json     root scripts (install / dev / migrate / seed / build / start)
.env.example     copy to .env for local dev
```

## Prerequisites

- Node.js **20+**
- PostgreSQL **14+** (local install, Docker, or any managed Postgres)

## Local development

1. **Configure env** — copy the example and fill it in:

   ```bash
   cp .env.example .env
   # set DATABASE_URL, JWT_SECRET, ADMIN_NAME/EMAIL/PASSWORD
   ```

2. **Create the database** (if using a local Postgres):

   ```bash
   createdb rewardsdesk
   ```

3. **Install dependencies** (both workspaces):

   ```bash
   npm run install:all
   ```

4. **Migrate + seed**:

   ```bash
   npm run migrate
   npm run seed
   ```

5. **Run** — two terminals:

   ```bash
   npm run dev:server   # Express on :3000
   npm run dev:client   # Vite on :5173 (proxies /api -> :3000)
   ```

   Open http://localhost:5173.

## Environment variables

| Var              | Required        | Notes                                                        |
| ---------------- | --------------- | ------------------------------------------------------------ |
| `DATABASE_URL`   | yes             | Postgres connection string.                                  |
| `PGSSL`          | no              | `true` to force TLS (most external managed Postgres).        |
| `JWT_SECRET`     | yes             | Long random string; signs the auth cookie.                   |
| `ADMIN_NAME`     | seed only       | Initial owner account name.                                  |
| `ADMIN_EMAIL`    | seed only       | Initial owner login email.                                   |
| `ADMIN_PASSWORD` | seed only       | Initial owner password (re-seeding resets it).               |
| `NODE_ENV`       | yes (prod)      | `production` enables secure cookies + serves the built app.  |
| `PORT`           | no              | Defaults to `3000`. Railway injects this.                    |
| `CLIENT_ORIGIN`  | dev only        | Vite origin allowed by CORS (default `http://localhost:5173`).|
| `COOKIE_DOMAIN`  | prod (optional) | Domain for the auth cookie.                                  |

## Deploy (Railway)

1. Create a Railway project and attach a **PostgreSQL** plugin (provides `DATABASE_URL`).
2. Set env vars: `JWT_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `NODE_ENV=production` (and `COOKIE_DOMAIN` if you serve from a custom domain).
3. Build command: `npm run build` (installs both workspaces and builds the client).
4. Start command: `npm start` (Express serves `client/dist` and exposes `/api`).
5. After the first deploy, run `npm run migrate` and `npm run seed` once (Railway shell
   or a one-off command) to create the schema and the owner account.

## Build phases

This project is built in sequence (see the spec). Current status:

- **Phase 1 — Scaffold + DB:** ✓ migrations, pg pool, migrate/seed, Tailwind + PWA config.
