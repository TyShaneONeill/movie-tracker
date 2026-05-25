ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS is_revocable BOOLEAN NOT NULL DEFAULT false;

UPDATE public.achievements SET is_revocable = false
  WHERE name IN ('First Take', 'Night Owl');

UPDATE public.achievements SET is_revocable = true
  WHERE name IN ('Cinephile', 'Critic', 'Genre Explorer',
                 'Binge Watcher', 'Show Explorer', 'TV Marathoner',
                 'Series Finisher', 'Season Slayer');
