-- 002_hotel_timezone.sql — store the property's IANA timezone so reporting
-- (dashboard day/month/year buckets, trend) uses the hotel's local calendar
-- instead of the DB session timezone (UTC on Railway).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';
