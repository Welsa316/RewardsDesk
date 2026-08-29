-- Which public pages a promo appears on. Promos are mostly rewards offers, so
-- the parking payment page is deliberately not in the default: a guest halfway
-- through paying should not be advertised at.
ALTER TABLE promo_posts
  ADD COLUMN IF NOT EXISTS show_on TEXT[] NOT NULL DEFAULT ARRAY['home', 'enroll'];

-- Existing promos keep appearing where they already did, minus parking.
UPDATE promo_posts SET show_on = ARRAY['home', 'enroll'] WHERE show_on IS NULL;
