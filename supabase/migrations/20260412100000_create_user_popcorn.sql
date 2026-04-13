CREATE TABLE public.user_popcorn (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  reference_id    UUID,
  seed            INTEGER NOT NULL,
  is_milestone    BOOLEAN NOT NULL DEFAULT false,
  achievement_id  UUID REFERENCES public.achievements(id),
  is_retroactive  BOOLEAN NOT NULL DEFAULT false,
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE NULLS NOT DISTINCT (user_id, action_type, reference_id)
);

CREATE INDEX user_popcorn_user_id_idx ON public.user_popcorn(user_id);
CREATE INDEX user_popcorn_action_type_idx ON public.user_popcorn(user_id, action_type);

ALTER TABLE public.user_popcorn ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own popcorn"
  ON public.user_popcorn FOR SELECT USING (auth.uid() = user_id);
