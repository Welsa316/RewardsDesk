-- 005_parking_refund_link.sql — link refund rows to the charge they refund,
-- so the over-refund guard is per-payment and the audit trail is navigable.
ALTER TABLE parking_payments
  ADD COLUMN IF NOT EXISTS refunded_payment_id INTEGER REFERENCES parking_payments(id);

CREATE INDEX IF NOT EXISTS idx_parking_payments_refunded
  ON parking_payments (refunded_payment_id) WHERE refunded_payment_id IS NOT NULL;
