-- Correctness harness for public.get_user_year_recap.
-- Run against the local DB (migration applied):
--   psql "$DB" -f supabase/tests/get_user_year_recap_test.sql
-- Exits non-zero (RAISE EXCEPTION) on the first failed assertion; prints "ALL RECAP TESTS PASSED" on success.
--
-- NOTE: runtime_minutes lives on public.movies (TMDB metadata cache, joined by tmdb_id),
-- NOT on public.user_movies. The harness seeds public.movies so hours_watched resolves
-- via the RPC's LEFT JOIN. See migration header for the deviation from the original spec.

DO $$
DECLARE
  v_user uuid := '00000000-0000-0000-0000-0000000000aa';
  v_show uuid;
  v_recap jsonb;
BEGIN
  -- The RPC is SECURITY DEFINER and filters on auth.uid(); make auth.uid() resolve to v_user
  -- for this session (auth.uid() reads request.jwt.claim.sub).
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  DELETE FROM public.user_movies WHERE user_id = v_user;
  DELETE FROM public.user_episode_watches WHERE user_id = v_user;
  DELETE FROM public.user_tv_shows WHERE user_id = v_user;
  DELETE FROM public.theater_visits WHERE user_id = v_user;
  DELETE FROM public.movies WHERE tmdb_id IN (1, 2, 3, 4, 5);

  -- user_movies.user_id has a FK to auth.users; seed a throwaway user.
  INSERT INTO auth.users (id) VALUES (v_user) ON CONFLICT (id) DO NOTHING;

  -- Runtime metadata lives on public.movies (joined by tmdb_id).
  INSERT INTO public.movies (tmdb_id, title, runtime_minutes, genre_ids) VALUES
    (1, 'Alpha',  120, ARRAY[878]),
    (2, 'Beta',   100, ARRAY[878,28]),
    (3, 'NYE',    90,  ARRAY[18]),
    (4, 'NextYr', 95,  ARRAY[35]),
    (5, 'OnList', 95,  ARRAY[35]);

  INSERT INTO public.user_movies (user_id, tmdb_id, title, status, genre_ids, watch_format, theater_chain, added_at, watched_at) VALUES
    (v_user, 1, 'Alpha',  'watched', ARRAY[878], 'imax',     'AMC',     '2025-03-01T00:00:00Z', '2025-03-01T00:00:00Z'),
    (v_user, 2, 'Beta',   'watched', ARRAY[878,28], NULL,     NULL,      '2025-06-01T00:00:00Z', NULL),
    (v_user, 3, 'NYE',    'watched', ARRAY[18], 'dolby',     'Regal',   '2026-01-01T04:30:00Z', '2026-01-01T04:30:00Z'),
    (v_user, 4, 'NextYr', 'watched', ARRAY[35], 'standard',  NULL,      '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'),
    (v_user, 5, 'OnList', 'watchlist', ARRAY[35], NULL,       NULL,      '2025-05-01T00:00:00Z', NULL);

  -- user_episode_watches.user_tv_show_id is NOT NULL + FK to user_tv_shows; seed the parent show.
  INSERT INTO public.user_tv_shows (user_id, tmdb_id, name) VALUES (v_user, 100, 'Gamma Show')
  RETURNING id INTO v_show;

  INSERT INTO public.user_episode_watches (user_id, user_tv_show_id, tmdb_show_id, season_number, episode_number, episode_runtime, watched_at) VALUES
    (v_user, v_show, 100, 1, 1, 30, '2025-04-01T00:00:00Z'),
    (v_user, v_show, 100, 1, 2, 30, '2025-04-02T00:00:00Z');

  v_recap := public.get_user_year_recap(2025, 'America/New_York');
  ASSERT (v_recap->>'films_seen')::int = 3, format('films_seen expected 3, got %s', v_recap->>'films_seen');
  ASSERT (v_recap->>'hours_watched')::numeric = 310, format('hours_watched expected 310, got %s', v_recap->>'hours_watched');
  ASSERT (v_recap->>'episodes_watched')::int = 2, format('episodes expected 2, got %s', v_recap->>'episodes_watched');
  ASSERT (v_recap->'first_film'->>'title') = 'Alpha', format('first_film expected Alpha, got %s', v_recap->'first_film'->>'title');
  ASSERT (v_recap->'last_film'->>'title') = 'NYE', format('last_film expected NYE, got %s', v_recap->'last_film'->>'title');
  ASSERT jsonb_array_length(v_recap->'formats') = 2, format('formats expected 2 entries, got %s', v_recap->'formats');
  ASSERT (v_recap->>'available_years') LIKE '%2025%' AND (v_recap->>'available_years') LIKE '%2026%', format('available_years should include 2025 and 2026, got %s', v_recap->>'available_years');

  v_recap := public.get_user_year_recap(2025, 'Not/AZone');
  ASSERT (v_recap->>'films_seen')::int = 2, format('UTC-fallback 2025 films expected 2 (Alpha,Beta), got %s', v_recap->>'films_seen');

  v_recap := public.get_user_year_recap(2030, 'UTC');
  ASSERT (v_recap->>'films_seen')::int = 0, format('empty year films expected 0, got %s', v_recap->>'films_seen');
  ASSERT (v_recap->'first_film') = 'null'::jsonb, format('empty year first_film expected null, got %s', v_recap->'first_film');

  DELETE FROM public.user_movies WHERE user_id = v_user;
  DELETE FROM public.user_episode_watches WHERE user_id = v_user;
  DELETE FROM public.user_tv_shows WHERE user_id = v_user;
  DELETE FROM public.theater_visits WHERE user_id = v_user;
  DELETE FROM public.movies WHERE tmdb_id IN (1, 2, 3, 4, 5);
  DELETE FROM auth.users WHERE id = v_user;
  RAISE NOTICE 'ALL RECAP TESTS PASSED';
END $$;
