-- 003_reporting_indexes_cleanup.sql
-- 1) Indexes for the hot reporting/search paths.
-- 2) Data fix: a record reverted to 'pending' (queue Undo) should carry no
--    processor attribution — matches the PATCH handler change that now clears
--    processed_by/processed_at when a record returns to pending.

CREATE INDEX IF NOT EXISTS idx_enrollments_processed_at
  ON enrollments (processed_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_active_status
  ON enrollments (status) WHERE deleted_at IS NULL;

UPDATE enrollments
   SET processed_by = NULL, processed_at = NULL
 WHERE status = 'pending'
   AND (processed_by IS NOT NULL OR processed_at IS NOT NULL);

-- Trigram indexes for the %term% name/email/phone search. pg_trgm ships with
-- Postgres (and is allowed on Railway); skip gracefully where unavailable.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable; skipping trigram indexes';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_enrollments_name_trgm
      ON enrollments USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_enrollments_email_trgm
      ON enrollments USING gin (email gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_enrollments_phone_trgm
      ON enrollments USING gin (phone gin_trgm_ops);
  END IF;
END $$;
