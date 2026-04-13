CREATE TABLE IF NOT EXISTS public.achievement_levels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id  UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL,
  criteria_value  INTEGER NOT NULL,
  description     TEXT NOT NULL,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (achievement_id, level)
);

CREATE INDEX IF NOT EXISTS idx_achievement_levels_achievement_id
  ON public.achievement_levels(achievement_id);

ALTER TABLE public.achievement_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Achievement levels viewable by everyone"
  ON public.achievement_levels FOR SELECT USING (true);
