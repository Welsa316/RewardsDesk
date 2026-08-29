-- Tracks that an expiry reminder has been sent for a session, so the sweeper
-- can claim rows atomically and never email the same guest twice — including
-- across multiple app instances.
ALTER TABLE parking_sessions
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ;

-- Supports the sweeper's lookup: unsent reminders on active sessions, ordered
-- by when they expire. Partial, so it stays small however many sessions exist.
CREATE INDEX IF NOT EXISTS idx_parking_expiry_reminder_due
  ON parking_sessions (paid_through)
  WHERE expiry_reminder_sent_at IS NULL AND disposition = 'active';
