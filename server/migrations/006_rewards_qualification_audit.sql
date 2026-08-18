-- 006_rewards_qualification_audit.sql
-- 1) Qualification tracking: the desk marks a guest 'enrolled'; Best Western
--    later reports which enrollments actually counted for the property. That
--    outcome is a SEPARATE field from the desk disposition so both are visible.
-- 2) Per-staff monthly goals.
-- 3) Generalize status_history into a full audit trail (created / status /
--    qualification / notes / delete), keeping every existing row valid.

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS qualification TEXT
  CHECK (qualification IN ('qualified', 'disqualified'));
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS qualified_by INTEGER REFERENCES users(id);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollments_qualification
  ON enrollments (qualification) WHERE deleted_at IS NULL;

-- Per-staff monthly enrollment target (NULL = no personal goal set).
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_goal INTEGER;

-- status_history now records every auditable event, not just status changes.
-- Existing rows keep their meaning via the default.
ALTER TABLE status_history ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'status_change';
ALTER TABLE status_history ADD COLUMN IF NOT EXISTS detail TEXT;

CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON status_history (changed_at);
