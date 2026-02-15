-- Achievements table: static definitions of all possible achievements
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏆',
  criteria_type text NOT NULL,
  criteria_value integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User achievements: tracks which users have earned which achievements
CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements (user_id);
CREATE INDEX idx_user_achievements_achievement_id ON public.user_achievements (achievement_id);

-- RLS policies
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Everyone can read achievement definitions
CREATE POLICY "Achievements are viewable by everyone"
  ON public.achievements FOR SELECT TO public
  USING (true);

-- Users can read their own achievements (and others' for profile viewing)
CREATE POLICY "User achievements are viewable by everyone"
  ON public.user_achievements FOR SELECT TO public
  USING (true);

-- Only service role (edge function) can insert user achievements
CREATE POLICY "Service role can insert user achievements"
  ON public.user_achievements FOR INSERT
  WITH CHECK (false);

-- Seed initial achievements
INSERT INTO public.achievements (name, description, icon, criteria_type, criteria_value, sort_order) VALUES
  ('First Take', 'Post your first review', '🎬', 'first_take_count', 1, 1),
  ('Cinephile', 'Watch 10 movies', '🎥', 'watched_count', 10, 2),
  ('Critic', 'Post 10 reviews', '✍️', 'first_take_count', 10, 3),
  ('Night Owl', 'Log a movie after midnight', '🦉', 'night_owl', 1, 4),
  ('Genre Explorer', 'Watch movies in 5 different genres', '🧭', 'genre_count', 5, 5);
