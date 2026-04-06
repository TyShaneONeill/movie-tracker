-- Flip crop_ticket_photos to opt-in (default false) for all users.
-- The feature is experimental and needs more work before enabling by default.
ALTER TABLE profiles ALTER COLUMN crop_ticket_photos SET DEFAULT false;
UPDATE profiles SET crop_ticket_photos = false;
