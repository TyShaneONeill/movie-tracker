-- Add ticket scan data columns to user_movies
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS theater_chain text;
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS ticket_type text;
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS mpaa_rating text;

-- Private table for barcode data (strict own-user-only RLS — never public)
CREATE TABLE IF NOT EXISTS ticket_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  journey_id uuid REFERENCES user_movies(id) ON DELETE CASCADE,
  barcode_data text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE ticket_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own ticket scans"
  ON ticket_scans FOR ALL
  USING (user_id = auth.uid());
