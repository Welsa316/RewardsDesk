-- Lets a promo image act as a link. Deliberately an enum-ish text column rather
-- than a free URL: these images sit on pages that take card payments, and a
-- free-text destination is an open redirect waiting to be pasted into. The two
-- values cover what a promo is actually for — sending someone to enrol, or to
-- pay for parking.
ALTER TABLE promo_posts
  ADD COLUMN IF NOT EXISTS link_to TEXT NOT NULL DEFAULT 'none';

ALTER TABLE promo_posts
  ADD CONSTRAINT promo_posts_link_to_check
  CHECK (link_to IN ('none', 'enroll', 'park'));
