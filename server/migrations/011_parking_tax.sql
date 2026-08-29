-- Percentage tax on parking, stored in basis points so a rate like 20% is the
-- integer 2000 and no float rounding can drift. 0 means no tax, which is what
-- every existing install gets until an admin sets one.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS parking_tax_bps INT NOT NULL DEFAULT 0;

ALTER TABLE settings
  ADD CONSTRAINT settings_parking_tax_bps_check
  CHECK (parking_tax_bps >= 0 AND parking_tax_bps <= 10000);

-- The split behind every charge and refund. amount_cents remains the amount
-- that actually moved, so the refund guard and every existing total keep
-- working untouched; these two say what it was made of.
ALTER TABLE parking_payments
  ADD COLUMN IF NOT EXISTS subtotal_cents INT,
  ADD COLUMN IF NOT EXISTS tax_cents INT;

-- Existing rows predate tax, so their whole amount was subtotal. Backfilling
-- rather than leaving NULL means reports never have to special-case history.
UPDATE parking_payments
   SET subtotal_cents = amount_cents, tax_cents = 0
 WHERE subtotal_cents IS NULL;

-- New installs start at the current rate rather than an old one.
ALTER TABLE settings ALTER COLUMN parking_daily_cents SET DEFAULT 650;
