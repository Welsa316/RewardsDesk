-- Special daily parking rate for a date range.
-- The column is named rate_cents rather than the brief's "rate" because every
-- other money column in this schema is in cents; mixing dollars and cents is
-- what produced the full-refund bug, so the unit stays in the name.
CREATE TABLE IF NOT EXISTS parking_promos (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  rate_cents  INTEGER NOT NULL CHECK (rate_cents > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  INTEGER REFERENCES users(id),
  CONSTRAINT parking_promos_dates_ordered CHECK (start_date <= end_date)
);

-- Looked up on every price calculation: "cheapest promo active on this date".
CREATE INDEX IF NOT EXISTS idx_parking_promos_active
  ON parking_promos (start_date, end_date, rate_cents);
