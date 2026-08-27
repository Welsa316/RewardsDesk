-- Promotional image posts shown on the public home page and above the parking
-- payment form for a scheduled date range.
CREATE TABLE IF NOT EXISTS promo_posts (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  image_url   TEXT NOT NULL,
  -- Plain dates, compared against the hotel's calendar day rather than an
  -- instant, so "through the 30th" means the whole of the 30th at the property.
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  INTEGER REFERENCES users(id),
  CONSTRAINT promo_posts_dates_ordered CHECK (start_date <= end_date)
);

-- The public lookup is always "active on this date", so index the range.
CREATE INDEX IF NOT EXISTS idx_promo_posts_active
  ON promo_posts (start_date, end_date);
