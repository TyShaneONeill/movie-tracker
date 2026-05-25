ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'movies';

UPDATE public.achievements SET category = 'tv'
WHERE name IN ('Binge Watcher', 'Show Explorer', 'TV Marathoner', 'Series Finisher', 'Season Slayer');

UPDATE public.achievements SET category = 'movies'
WHERE name IN ('First Take', 'Cinephile', 'Critic', 'Night Owl', 'Genre Explorer');
