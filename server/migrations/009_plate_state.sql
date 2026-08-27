-- Two-letter state for the licence plate. Nullable: sessions recorded before
-- this exist without one, and plate lookups must keep working for them.
ALTER TABLE parking_sessions ADD COLUMN IF NOT EXISTS plate_state CHAR(2);

-- Lookups match on plate + state when both are known, so index the pair.
CREATE INDEX IF NOT EXISTS idx_parking_plate_state
  ON parking_sessions (plate, plate_state);
