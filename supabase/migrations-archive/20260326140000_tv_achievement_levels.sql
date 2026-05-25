-- Overhaul TV achievements: fix criteria, add leveled achievement_levels rows,
-- and clean up stale user_achievements earned under the old (incorrect) criteria.

-- ============================================================
-- 1. Remove stale user_achievements for TV achievements
--    (earned when criteria_type was wrong; levels will be
--     re-awarded correctly on the next check-achievements call)
-- ============================================================
DELETE FROM public.user_achievements
WHERE achievement_id IN (
  SELECT id FROM public.achievements
  WHERE name IN ('Binge Watcher', 'Show Explorer', 'TV Marathoner', 'Series Finisher', 'Season Slayer')
);

-- ============================================================
-- 2. Fix achievements table top-level metadata
-- ============================================================
UPDATE public.achievements
SET criteria_type = 'tv_watched_count', criteria_value = 1, description = 'Watch TV shows'
WHERE name = 'Binge Watcher';

UPDATE public.achievements
SET criteria_type = 'tv_genre_count', criteria_value = 3, description = 'Explore TV across genres'
WHERE name = 'Show Explorer';

UPDATE public.achievements
SET criteria_type = 'tv_episodes_count', criteria_value = 10, description = 'Watch TV episodes'
WHERE name = 'TV Marathoner';

UPDATE public.achievements
SET criteria_type = 'tv_completed_count', criteria_value = 1, description = 'Complete TV series'
WHERE name = 'Series Finisher';

UPDATE public.achievements
SET criteria_type = 'tv_seasons_count', criteria_value = 3, description = 'Complete seasons across any shows'
WHERE name = 'Season Slayer';

-- ============================================================
-- 3. Clear any existing TV achievement_levels (idempotent)
-- ============================================================
DELETE FROM public.achievement_levels
WHERE achievement_id IN (
  SELECT id FROM public.achievements
  WHERE name IN ('Binge Watcher', 'Show Explorer', 'TV Marathoner', 'Series Finisher', 'Season Slayer')
);

-- ============================================================
-- 4. Binge Watcher — tv_watched_count
-- ============================================================
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1,  1,  'Watch your first TV show'  FROM public.achievements WHERE name = 'Binge Watcher' UNION ALL
SELECT id, 2,  5,  'Watch 5 TV shows'           FROM public.achievements WHERE name = 'Binge Watcher' UNION ALL
SELECT id, 3,  10, 'Watch 10 TV shows'          FROM public.achievements WHERE name = 'Binge Watcher' UNION ALL
SELECT id, 4,  25, 'Watch 25 TV shows'          FROM public.achievements WHERE name = 'Binge Watcher' UNION ALL
SELECT id, 5,  50, 'Watch 50 TV shows'          FROM public.achievements WHERE name = 'Binge Watcher';

-- ============================================================
-- 5. Show Explorer — tv_genre_count
-- ============================================================
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1, 3,  'Watch shows across 3 genres'  FROM public.achievements WHERE name = 'Show Explorer' UNION ALL
SELECT id, 2, 5,  'Watch shows across 5 genres'  FROM public.achievements WHERE name = 'Show Explorer' UNION ALL
SELECT id, 3, 8,  'Watch shows across 8 genres'  FROM public.achievements WHERE name = 'Show Explorer' UNION ALL
SELECT id, 4, 12, 'Watch shows across 12 genres' FROM public.achievements WHERE name = 'Show Explorer' UNION ALL
SELECT id, 5, 16, 'Watch shows across 16 genres' FROM public.achievements WHERE name = 'Show Explorer';

-- ============================================================
-- 6. TV Marathoner — tv_episodes_count
-- ============================================================
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1, 10,  'Watch 10 TV episodes'  FROM public.achievements WHERE name = 'TV Marathoner' UNION ALL
SELECT id, 2, 50,  'Watch 50 TV episodes'  FROM public.achievements WHERE name = 'TV Marathoner' UNION ALL
SELECT id, 3, 100, 'Watch 100 TV episodes' FROM public.achievements WHERE name = 'TV Marathoner' UNION ALL
SELECT id, 4, 250, 'Watch 250 TV episodes' FROM public.achievements WHERE name = 'TV Marathoner' UNION ALL
SELECT id, 5, 500, 'Watch 500 TV episodes' FROM public.achievements WHERE name = 'TV Marathoner';

-- ============================================================
-- 7. Series Finisher — tv_completed_count
-- ============================================================
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1, 1,  'Complete your first TV series' FROM public.achievements WHERE name = 'Series Finisher' UNION ALL
SELECT id, 2, 5,  'Complete 5 TV series'          FROM public.achievements WHERE name = 'Series Finisher' UNION ALL
SELECT id, 3, 10, 'Complete 10 TV series'         FROM public.achievements WHERE name = 'Series Finisher' UNION ALL
SELECT id, 4, 25, 'Complete 25 TV series'         FROM public.achievements WHERE name = 'Series Finisher' UNION ALL
SELECT id, 5, 50, 'Complete 50 TV series'         FROM public.achievements WHERE name = 'Series Finisher';

-- ============================================================
-- 8. Season Slayer — tv_seasons_count
--    (sum of number_of_seasons across all completed series)
-- ============================================================
INSERT INTO public.achievement_levels (achievement_id, level, criteria_value, description)
SELECT id, 1, 3,   'Complete 3 seasons across any shows'   FROM public.achievements WHERE name = 'Season Slayer' UNION ALL
SELECT id, 2, 10,  'Complete 10 seasons across any shows'  FROM public.achievements WHERE name = 'Season Slayer' UNION ALL
SELECT id, 3, 25,  'Complete 25 seasons across any shows'  FROM public.achievements WHERE name = 'Season Slayer' UNION ALL
SELECT id, 4, 50,  'Complete 50 seasons across any shows'  FROM public.achievements WHERE name = 'Season Slayer' UNION ALL
SELECT id, 5, 100, 'Complete 100 seasons across any shows' FROM public.achievements WHERE name = 'Season Slayer';
