-- 004_parking.sql — guest parking product: sessions, payments audit, notes,
-- and parking settings. All money is integer cents. Session display status is
-- DERIVED at read time from disposition + paid_through (see lib/parking.js);
-- only the lifecycle disposition is stored.

-- ── settings: parking config ───────────────────────────────
-- SQL defaults keep migrate+seed (which run on every deploy) idempotent.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parking_brand_name TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parking_capacity INTEGER NOT NULL DEFAULT 50;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parking_hourly_cents INTEGER NOT NULL DEFAULT 500;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parking_daily_cents INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parking_lots TEXT[] NOT NULL DEFAULT ARRAY['lot-a'];
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parking_expiring_soon_minutes INTEGER NOT NULL DEFAULT 60;

-- One-time brand seed from hotel_name on upgraded installs. Fresh installs
-- create the settings row via seed AFTER this migration, leaving NULL — the
-- API COALESCEs to hotel_name, so both paths behave identically.
UPDATE settings SET parking_brand_name = hotel_name
 WHERE id = 1 AND parking_brand_name IS NULL;

-- ── parking_sessions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_sessions (
  id                 SERIAL PRIMARY KEY,
  confirmation_code  TEXT UNIQUE NOT NULL,
  status_token       UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  guest_name         TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  plate              TEXT NOT NULL,
  vehicle_desc       TEXT,
  room               TEXT,
  lot                TEXT,
  kind               TEXT NOT NULL CHECK (kind IN ('online', 'desk', 'comp')),
  desk_method        TEXT CHECK (desk_method IN ('cash', 'card_terminal')),
  comp_reason        TEXT,
  comp_authorized_by TEXT,
  rate_type          TEXT NOT NULL CHECK (rate_type IN ('hourly', 'daily')),
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  disposition        TEXT NOT NULL DEFAULT 'pending_payment'
                     CHECK (disposition IN ('pending_payment', 'active', 'departed', 'canceled')),
  starts_at          TIMESTAMPTZ,
  paid_through       TIMESTAMPTZ,
  created_by         INTEGER REFERENCES users(id),
  checked_out_by     INTEGER REFERENCES users(id),
  checked_out_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parking_sessions_paid_through ON parking_sessions (paid_through);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_disposition  ON parking_sessions (disposition);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_created_at   ON parking_sessions (created_at);

-- ── parking_payments (append-only audit trail) ─────────────
-- Net paid for a session = SUM(succeeded charges) - SUM(succeeded refunds).
CREATE TABLE IF NOT EXISTS parking_payments (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES parking_sessions(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('charge', 'refund')),
  purpose       TEXT NOT NULL CHECK (purpose IN ('initial', 'extension', 'refund')),
  method        TEXT NOT NULL CHECK (method IN ('stripe', 'cash', 'card_terminal', 'comp')),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents >= 0),
  rate_type     TEXT CHECK (rate_type IN ('hourly', 'daily')),
  quantity      INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id   TEXT,
  stripe_refund_id           TEXT UNIQUE,
  receipt_url   TEXT,
  created_by    INTEGER REFERENCES users(id),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parking_payments_session ON parking_payments (session_id);
CREATE INDEX IF NOT EXISTS idx_parking_payments_created ON parking_payments (created_at);

-- ── parking_notes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_notes (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES parking_sessions(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parking_notes_session ON parking_notes (session_id);

-- ── trigram search (guarded, mirrors 003) ──────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable; skipping trigram indexes';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_parking_plate_trgm ON parking_sessions USING gin (plate gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_parking_name_trgm  ON parking_sessions USING gin (guest_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_parking_phone_trgm ON parking_sessions USING gin (phone gin_trgm_ops);
  END IF;
END $$;
