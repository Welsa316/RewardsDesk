-- 001_init.sql — initial schema for RewardsDesk
-- Run via `npm run migrate`. Each file in /migrations runs once, in filename order.

-- ── users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── enrollments ────────────────────────────────────────────
-- Address is stored as components so it maps cleanly onto browser
-- autofill tokens (address-line1, address-level2, etc.).
CREATE TABLE IF NOT EXISTS enrollments (
  id            SERIAL PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'US',
  source        TEXT NOT NULL DEFAULT 'manual',
  consent       BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at    TIMESTAMPTZ,
  prefilled     BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'enrolled', 'declined', 'already_member', 'duplicate')),
  processed_by  INTEGER REFERENCES users(id),
  processed_at  TIMESTAMPTZ,
  notes         TEXT,
  deleted_at    TIMESTAMPTZ,            -- soft delete; NULL = active
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_status       ON enrollments (status);
CREATE INDEX IF NOT EXISTS idx_enrollments_source       ON enrollments (source);
CREATE INDEX IF NOT EXISTS idx_enrollments_created_at   ON enrollments (created_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_processed_by ON enrollments (processed_by);
CREATE INDEX IF NOT EXISTS idx_enrollments_deleted_at   ON enrollments (deleted_at);

-- ── status_history ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS status_history (
  id            SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  old_status    TEXT,
  new_status    TEXT,
  changed_by    INTEGER REFERENCES users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_enrollment ON status_history (enrollment_id);

-- ── settings (single-row config) ───────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  hotel_name    TEXT DEFAULT 'Best Western Plus New Orleans Airport Hotel',
  property_code TEXT DEFAULT '19119',
  annual_goal   INTEGER DEFAULT 312,
  monthly_goal  INTEGER DEFAULT 26,
  sources       TEXT[] DEFAULT ARRAY['qr-lobby', 'qr-room', 'canary', 'front-desk', 'other'],
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);
