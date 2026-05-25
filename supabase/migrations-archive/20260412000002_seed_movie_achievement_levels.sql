-- First Take (single level, point-in-time)
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1, 1, 'Post your first First Take'
FROM public.achievements WHERE name = 'First Take'
ON CONFLICT (achievement_id, level) DO NOTHING;

-- Cinephile (multi-level)
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, lvl, val, desc FROM public.achievements
CROSS JOIN (VALUES
  (1, 10,  'Watch 10 movies'),
  (2, 25,  'Watch 25 movies'),
  (3, 50,  'Watch 50 movies'),
  (4, 100, 'Watch 100 movies'),
  (5, 250, 'Watch 250 movies')
) AS t(lvl, val, desc)
WHERE name = 'Cinephile'
ON CONFLICT (achievement_id, level) DO NOTHING;

-- Critic (multi-level)
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, lvl, val, desc FROM public.achievements
CROSS JOIN (VALUES
  (1, 1,  'Post your first review'),
  (2, 10, 'Post 10 reviews'),
  (3, 25, 'Post 25 reviews'),
  (4, 50, 'Post 50 reviews')
) AS t(lvl, val, desc)
WHERE name = 'Critic'
ON CONFLICT (achievement_id, level) DO NOTHING;

-- Night Owl (single level)
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1, 1, 'Log a movie after midnight'
FROM public.achievements WHERE name = 'Night Owl'
ON CONFLICT (achievement_id, level) DO NOTHING;

-- Genre Explorer (multi-level)
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, lvl, val, desc FROM public.achievements
CROSS JOIN (VALUES
  (1, 5,  'Explore 5 genres'),
  (2, 10, 'Explore 10 genres'),
  (3, 15, 'Explore 15 genres')
) AS t(lvl, val, desc)
WHERE name = 'Genre Explorer'
ON CONFLICT (achievement_id, level) DO NOTHING;
