-- Fix TV achievements: assign real criteria types and values
-- These rows exist in the achievements table but have null/invalid criteria

UPDATE public.achievements
SET criteria_type = 'tv_watched_count', criteria_value = 1
WHERE name = 'Show Explorer';

UPDATE public.achievements
SET criteria_type = 'tv_watched_count', criteria_value = 10
WHERE name = 'Binge Watcher';

UPDATE public.achievements
SET criteria_type = 'tv_episodes_count', criteria_value = 100
WHERE name = 'TV Marathoner';

UPDATE public.achievements
SET criteria_type = 'tv_completed_count', criteria_value = 1
WHERE name = 'Series Finisher';

UPDATE public.achievements
SET criteria_type = 'tv_completed_count', criteria_value = 5
WHERE name = 'Season Slayer';
