


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."award_popcorn_retroactive"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_first_take_count INTEGER;
  v_comment_count INTEGER;
  v_like_count INTEGER;
  v_owed INTEGER;
  v_earned INTEGER;
  i INTEGER;
BEGIN
  -- Follows
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'follow', following_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, created_at
  FROM follows WHERE follower_id = p_user_id
  ON CONFLICT DO NOTHING;

  -- Movies watched
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', 'movie:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(watched_at, added_at, now())
  FROM user_movies WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- TV shows watched
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', 'tv:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(updated_at, added_at, now())
  FROM user_tv_shows WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- first_take: 1 kernel per 10
  SELECT COUNT(*) INTO v_first_take_count FROM first_takes WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = p_user_id AND action_type = 'first_take';
  v_owed := FLOOR(v_first_take_count / 10) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (p_user_id, 'first_take', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  -- comment: 1 kernel per 10
  SELECT COUNT(*) INTO v_comment_count FROM review_comments WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = p_user_id AND action_type = 'comment';
  v_owed := FLOOR(v_comment_count / 10) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (p_user_id, 'comment', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  -- like: 1 kernel per 50
  SELECT COUNT(*) INTO v_like_count FROM review_likes WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = p_user_id AND action_type = 'like';
  v_owed := FLOOR(v_like_count / 50) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (p_user_id, 'like', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  RETURN 0;
END;
$$;


ALTER FUNCTION "public"."award_popcorn_retroactive"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_user_content"("content_user_id" "uuid", "content_visibility" "text" DEFAULT 'public'::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  profile_private boolean;
  viewer_id uuid;
  is_follower boolean;
BEGIN
  viewer_id := (SELECT auth.uid());

  -- Owner always sees own content
  IF viewer_id = content_user_id THEN
    RETURN true;
  END IF;

  -- Private content is always owner-only
  IF content_visibility = 'private' THEN
    RETURN false;
  END IF;

  -- Check if the content owner's profile is private
  SELECT is_private INTO profile_private
    FROM public.profiles
    WHERE id = content_user_id;

  -- Check if the viewer follows the content owner
  SELECT EXISTS(
    SELECT 1 FROM public.follows
    WHERE follower_id = viewer_id
      AND following_id = content_user_id
  ) INTO is_follower;

  -- Private profile: all non-private content requires follower status
  IF profile_private THEN
    RETURN is_follower;
  END IF;

  -- Public profile: respect content visibility setting
  IF content_visibility = 'public' THEN
    RETURN true;
  END IF;

  IF content_visibility = 'followers_only' THEN
    RETURN is_follower;
  END IF;

  -- Fallback: deny access
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."can_view_user_content"("content_user_id" "uuid", "content_visibility" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_increment_scan"("p_user_id" "uuid", "p_daily_limit" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_record scan_usage%ROWTYPE;
  v_account_tier text;
  v_tier_expires_at timestamptz;
  v_effective_limit integer;
  v_is_unlimited boolean := false;
  v_reset_at text;
BEGIN
  -- Build reset timestamp (midnight tomorrow UTC)
  v_reset_at := (v_today + 1)::text || 'T00:00:00Z';

  -- Look up user's account tier from profiles
  SELECT p.account_tier, p.tier_expires_at
  INTO v_account_tier, v_tier_expires_at
  FROM profiles p
  WHERE p.id = p_user_id;

  v_account_tier := COALESCE(v_account_tier, 'free');

  -- Auto-expire premium tier
  IF v_account_tier = 'premium' AND v_tier_expires_at IS NOT NULL AND v_tier_expires_at < now() THEN
    v_account_tier := 'free';
    UPDATE profiles SET account_tier = 'free', tier_expires_at = NULL WHERE id = p_user_id;
  END IF;

  -- Determine base limit from tier
  CASE v_account_tier
    WHEN 'dev' THEN
      v_is_unlimited := true;
      v_effective_limit := 999;
    WHEN 'premium' THEN
      v_effective_limit := 20;
    ELSE
      v_effective_limit := p_daily_limit;
  END CASE;

  -- Upsert scan_usage row, reset counts if new day
  INSERT INTO scan_usage (user_id, daily_count, last_scan_date, lifetime_scans, bonus_scans)
  VALUES (p_user_id, 0, v_today, 0, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET
    daily_count = CASE WHEN scan_usage.last_scan_date < v_today THEN 0 ELSE scan_usage.daily_count END,
    bonus_scans = CASE WHEN scan_usage.last_scan_date < v_today THEN 0 ELSE scan_usage.bonus_scans END,
    last_scan_date = v_today;

  -- Fetch the current record
  SELECT * INTO v_record FROM scan_usage WHERE user_id = p_user_id;

  -- Check bypass_rate_limit flag (manual per-user override, backward compat)
  IF v_record.bypass_rate_limit = true THEN
    v_is_unlimited := true;
  END IF;

  -- Add bonus scans to effective limit for non-unlimited users
  IF NOT v_is_unlimited THEN
    v_effective_limit := v_effective_limit + COALESCE(v_record.bonus_scans, 0);
  END IF;

  -- Check if rate limited
  IF NOT v_is_unlimited AND v_record.daily_count >= v_effective_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'scans_remaining', 0,
      'daily_limit', v_effective_limit,
      'account_tier', v_account_tier,
      'reset_at', v_reset_at
    );
  END IF;

  -- Increment counts
  UPDATE scan_usage
  SET daily_count = v_record.daily_count + 1,
      lifetime_scans = COALESCE(v_record.lifetime_scans, 0) + 1,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'scans_remaining', CASE WHEN v_is_unlimited THEN 999 ELSE v_effective_limit - v_record.daily_count - 1 END,
    'daily_limit', CASE WHEN v_is_unlimited THEN 999 ELSE v_effective_limit END,
    'account_tier', v_account_tier,
    'reset_at', v_reset_at
  );
END;
$$;


ALTER FUNCTION "public"."check_and_increment_scan"("p_user_id" "uuid", "p_daily_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_daily_ai_spend"("p_daily_limit_usd" numeric DEFAULT 10.0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_total_today numeric;
BEGIN
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  INTO v_total_today
  FROM public.ai_usage_costs
  WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

  RETURN jsonb_build_object(
    'allowed', v_total_today < p_daily_limit_usd,
    'total_today_usd', v_total_today,
    'daily_limit_usd', p_daily_limit_usd
  );
END;
$$;


ALTER FUNCTION "public"."check_daily_ai_spend"("p_daily_limit_usd" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_ip_rate_limit"("p_ip_address" "text", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
  v_reset_at timestamptz;
BEGIN
  -- Upsert rate limit row, resetting if window expired
  INSERT INTO public.ip_rate_limits (ip_address, action, window_count, window_start)
  VALUES (p_ip_address, p_action, 1, v_now)
  ON CONFLICT (ip_address, action) DO UPDATE
  SET
    window_count = CASE
      WHEN public.ip_rate_limits.window_start + (p_window_seconds || ' seconds')::interval < v_now
      THEN 1
      ELSE public.ip_rate_limits.window_count + 1
    END,
    window_start = CASE
      WHEN public.ip_rate_limits.window_start + (p_window_seconds || ' seconds')::interval < v_now
      THEN v_now
      ELSE public.ip_rate_limits.window_start
    END
  RETURNING window_count, window_start INTO v_count, v_window_start;

  v_reset_at := v_window_start + (p_window_seconds || ' seconds')::interval;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_max_requests,
    'remaining', GREATEST(0, p_max_requests - v_count),
    'limit', p_max_requests,
    'reset_at', v_reset_at::text
  );
END;
$$;


ALTER FUNCTION "public"."check_ip_rate_limit"("p_ip_address" "text", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
  v_is_dev boolean;
  v_reset_at timestamptz;
BEGIN
  -- Check if user is a dev-tier user (unlimited)
  SELECT (account_tier = 'dev') INTO v_is_dev
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_dev = true THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', p_max_requests,
      'limit', p_max_requests,
      'reset_at', (v_now + (p_window_seconds || ' seconds')::interval)::text
    );
  END IF;

  -- Upsert rate limit row, resetting if window expired
  INSERT INTO public.rate_limits (user_id, action, window_count, window_start)
  VALUES (p_user_id, p_action, 1, v_now)
  ON CONFLICT (user_id, action) DO UPDATE
  SET
    window_count = CASE
      WHEN public.rate_limits.window_start + (p_window_seconds || ' seconds')::interval < v_now
      THEN 1
      ELSE public.rate_limits.window_count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start + (p_window_seconds || ' seconds')::interval < v_now
      THEN v_now
      ELSE public.rate_limits.window_start
    END
  RETURNING window_count, window_start INTO v_count, v_window_start;

  v_reset_at := v_window_start + (p_window_seconds || ' seconds')::interval;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_max_requests,
    'remaining', GREATEST(0, p_max_requests - v_count),
    'limit', p_max_requests,
    'reset_at', v_reset_at::text
  );
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_movie_cache"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.movies m
  WHERE m.tmdb_fetched_at < NOW() - INTERVAL '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_movies um WHERE um.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_movie_likes uml WHERE uml.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.list_movies lm WHERE lm.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.first_takes ft WHERE ft.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.theater_visits tv WHERE tv.tmdb_id = m.tmdb_id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE LOG '[movies-cache-cleanup] Deleted % stale movie cache entries', deleted_count;

  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_movie_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_tv_cache"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Delete stale tv_shows entries (>30 days old, not referenced by any user)
  DELETE FROM tv_shows
  WHERE tmdb_fetched_at < now() - interval '30 days'
    AND tmdb_id NOT IN (
      SELECT DISTINCT tmdb_id FROM user_tv_shows
    );

  -- Delete stale tv_episodes_cache entries (>30 days old, not referenced by any user watches)
  DELETE FROM tv_episodes_cache
  WHERE tmdb_fetched_at < now() - interval '30 days'
    AND tmdb_show_id NOT IN (
      SELECT DISTINCT tmdb_show_id FROM user_episode_watches
    );
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_tv_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_follow_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id, data)
  VALUES (
    NEW.following_id,  -- Notify the person being followed
    'follow',
    NEW.follower_id,   -- Who followed them
    '{}'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_follow_notification"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."user_movies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "status" "text" DEFAULT 'watchlist'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "overview" "text",
    "poster_path" "text",
    "backdrop_path" "text",
    "release_date" "text",
    "vote_average" numeric(3,1),
    "genre_ids" integer[] DEFAULT '{}'::integer[],
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_liked" boolean DEFAULT false,
    "journey_number" integer DEFAULT 1,
    "watched_at" timestamp with time zone,
    "watch_time" time without time zone,
    "location_type" "text",
    "location_name" "text",
    "auditorium" "text",
    "seat_location" "text",
    "ticket_price" numeric(6,2),
    "ticket_id" "text",
    "watch_format" "text",
    "watched_with" "text"[],
    "journey_notes" "text",
    "journey_tagline" "text",
    "journey_photos" "text"[],
    "cover_photo_index" integer DEFAULT 0,
    "journey_created_at" timestamp with time zone DEFAULT "now"(),
    "journey_updated_at" timestamp with time zone DEFAULT "now"(),
    "ai_poster_url" "text",
    "ai_poster_rarity" "text",
    "display_poster" "text" DEFAULT 'original'::"text",
    "theater_chain" "text",
    "ticket_type" "text",
    "mpaa_rating" "text",
    CONSTRAINT "journey_number_positive" CHECK (("journey_number" >= 1)),
    CONSTRAINT "location_type_valid" CHECK ((("location_type" IS NULL) OR ("location_type" = ANY (ARRAY['theater'::"text", 'home'::"text", 'airplane'::"text", 'outdoor'::"text", 'other'::"text"])))),
    CONSTRAINT "user_movies_ai_poster_rarity_check" CHECK (("ai_poster_rarity" = ANY (ARRAY['common'::"text", 'holographic'::"text"]))),
    CONSTRAINT "user_movies_display_poster_check" CHECK (("display_poster" = ANY (ARRAY['original'::"text", 'ai_generated'::"text"]))),
    CONSTRAINT "user_movies_status_check" CHECK (("status" = ANY (ARRAY['watchlist'::"text", 'watching'::"text", 'watched'::"text"]))),
    CONSTRAINT "watch_format_valid" CHECK ((("watch_format" IS NULL) OR ("watch_format" = ANY (ARRAY['standard'::"text", 'imax'::"text", 'dolby'::"text", '3d'::"text", '4k'::"text", 'screenx'::"text", '4dx'::"text"]))))
);


ALTER TABLE "public"."user_movies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_movies"."journey_number" IS 'Sequential number for multiple viewings of the same movie (1, 2, 3...)';



COMMENT ON COLUMN "public"."user_movies"."journey_notes" IS 'Personal notes specific to this viewing (not the First Take)';



COMMENT ON COLUMN "public"."user_movies"."journey_tagline" IS 'Short tagline for this journey, e.g., Masterpiece';



CREATE OR REPLACE FUNCTION "public"."create_journey_with_next_number"("p_user_id" "uuid", "p_tmdb_id" integer, "p_title" "text", "p_overview" "text" DEFAULT NULL::"text", "p_poster_path" "text" DEFAULT NULL::"text", "p_backdrop_path" "text" DEFAULT NULL::"text", "p_release_date" "text" DEFAULT NULL::"text", "p_vote_average" numeric DEFAULT NULL::numeric, "p_genre_ids" integer[] DEFAULT '{}'::integer[]) RETURNS SETOF "public"."user_movies"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  next_num integer;
BEGIN
  -- Advisory lock on user+movie combo to prevent concurrent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || p_tmdb_id::text));

  SELECT COALESCE(MAX(journey_number), 0) + 1
  INTO next_num
  FROM user_movies
  WHERE user_id = p_user_id AND tmdb_id = p_tmdb_id;

  RETURN QUERY
  INSERT INTO user_movies (
    user_id, tmdb_id, status, title, overview, poster_path,
    backdrop_path, release_date, vote_average, genre_ids,
    journey_number, journey_created_at
  ) VALUES (
    p_user_id, p_tmdb_id, 'watched', p_title, p_overview, p_poster_path,
    p_backdrop_path, p_release_date, p_vote_average, p_genre_ids,
    next_num, now()
  )
  RETURNING *;
END;
$$;


ALTER FUNCTION "public"."create_journey_with_next_number"("p_user_id" "uuid", "p_tmdb_id" integer, "p_title" "text", "p_overview" "text", "p_poster_path" "text", "p_backdrop_path" "text", "p_release_date" "text", "p_vote_average" numeric, "p_genre_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_journey_for_movie"("p_tmdb_id" integer) RETURNS TABLE("id" "uuid", "user_id" "uuid", "tmdb_id" integer, "status" "text", "added_at" timestamp with time zone, "rating" integer, "notes" "text", "title" "text", "overview" "text", "poster_path" "text", "backdrop_path" "text", "release_date" "text", "vote_average" numeric, "genre_ids" integer[], "watch_provider" "text", "theater_name" "text", "cinema_location" "text", "watched_with" "text"[], "first_viewing" boolean, "display_poster" "text", "ai_poster_url" "text", "ai_poster_rarity" "text", "journey_number" integer, "journey_created_at" timestamp with time zone, "journey_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    um.id,
    um.user_id,
    um.tmdb_id,
    um.status,
    um.added_at,
    um.rating,
    um.notes,
    um.title,
    um.overview,
    um.poster_path,
    um.backdrop_path,
    um.release_date,
    um.vote_average,
    um.genre_ids,
    um.watch_provider,
    um.theater_name,
    um.cinema_location,
    um.watched_with,
    um.first_viewing,
    um.display_poster,
    um.ai_poster_url,
    um.ai_poster_rarity,
    um.journey_number,
    um.journey_created_at,
    um.journey_updated_at
  FROM public.user_movies um
  WHERE um.tmdb_id = p_tmdb_id
    AND um.user_id = auth.uid()
  ORDER BY um.journey_number ASC NULLS FIRST
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_journey_for_movie"("p_tmdb_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_journey_with_movie"("p_journey_id" "uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "tmdb_id" integer, "status" "text", "added_at" timestamp with time zone, "rating" integer, "notes" "text", "title" "text", "overview" "text", "poster_path" "text", "backdrop_path" "text", "release_date" "text", "vote_average" numeric, "genre_ids" integer[], "watch_provider" "text", "theater_name" "text", "cinema_location" "text", "watched_with" "text"[], "first_viewing" boolean, "display_poster" "text", "ai_poster_url" "text", "ai_poster_rarity" "text", "journey_number" integer, "journey_created_at" timestamp with time zone, "journey_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    um.id,
    um.user_id,
    um.tmdb_id,
    um.status,
    um.added_at,
    um.rating,
    um.notes,
    um.title,
    um.overview,
    um.poster_path,
    um.backdrop_path,
    um.release_date,
    um.vote_average,
    um.genre_ids,
    um.watch_provider,
    um.theater_name,
    um.cinema_location,
    um.watched_with,
    um.first_viewing,
    um.display_poster,
    um.ai_poster_url,
    um.ai_poster_rarity,
    um.journey_number,
    um.journey_created_at,
    um.journey_updated_at
  FROM public.user_movies um
  WHERE um.id = p_journey_id
    AND um.user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_journey_with_movie"("p_journey_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_movie_journeys"("p_tmdb_id" integer) RETURNS TABLE("id" "uuid", "user_id" "uuid", "tmdb_id" integer, "status" "text", "added_at" timestamp with time zone, "rating" integer, "notes" "text", "title" "text", "overview" "text", "poster_path" "text", "backdrop_path" "text", "release_date" "text", "vote_average" numeric, "genre_ids" integer[], "watch_provider" "text", "theater_name" "text", "cinema_location" "text", "watched_with" "text"[], "first_viewing" boolean, "display_poster" "text", "ai_poster_url" "text", "ai_poster_rarity" "text", "journey_number" integer, "journey_created_at" timestamp with time zone, "journey_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    um.id,
    um.user_id,
    um.tmdb_id,
    um.status,
    um.added_at,
    um.rating,
    um.notes,
    um.title,
    um.overview,
    um.poster_path,
    um.backdrop_path,
    um.release_date,
    um.vote_average,
    um.genre_ids,
    um.watch_provider,
    um.theater_name,
    um.cinema_location,
    um.watched_with,
    um.first_viewing,
    um.display_poster,
    um.ai_poster_url,
    um.ai_poster_rarity,
    um.journey_number,
    um.journey_created_at,
    um.journey_updated_at
  FROM public.user_movies um
  WHERE um.tmdb_id = p_tmdb_id
    AND um.user_id = auth.uid()
    AND um.status = 'watched'
  ORDER BY um.journey_number ASC;
END;
$$;


ALTER FUNCTION "public"."get_movie_journeys"("p_tmdb_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pending_release_reminders"() RETURNS TABLE("user_id" "uuid", "tmdb_id" integer, "category" "text", "title" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.category,
    MIN(eligible.title) AS title
  FROM (
    SELECT
      um.user_id,
      rc.tmdb_id,
      CASE
        WHEN rc.release_type IN (1, 2, 3) THEN 'theatrical'
        ELSE 'streaming'
      END AS category,
      rc.title
    FROM public.release_calendar rc
    JOIN public.user_movies um
      ON um.tmdb_id = rc.tmdb_id
      AND um.status = 'watchlist'
    WHERE rc.region = 'US'
      AND rc.release_date = CURRENT_DATE
      AND rc.release_type IN (1, 2, 3, 6)
      AND rc.title IS NOT NULL
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.push_notification_log pnl
    WHERE pnl.feature = 'release_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND pnl.data->>'category' = eligible.category
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.category;
$$;


ALTER FUNCTION "public"."get_pending_release_reminders"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_pending_release_reminders"() IS 'Returns watchlisted movies releasing today in US region, deduped against push_notification_log. Internal use only — called by send-release-reminders edge function.';



CREATE OR REPLACE FUNCTION "public"."get_pending_tv_episode_reminders"() RETURNS TABLE("user_id" "uuid", "tmdb_id" integer, "season_number" integer, "episode_number" integer, "show_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.season_number,
    eligible.episode_number,
    MIN(eligible.show_name) AS show_name
  FROM (
    SELECT
      uts.user_id,
      uts.tmdb_id,
      tse.season_number,
      tse.episode_number,
      uts.name AS show_name
    FROM public.tv_show_episodes tse
    JOIN public.user_tv_shows uts
      ON uts.tmdb_id = tse.tmdb_show_id
      AND uts.status = 'watching'
    WHERE tse.air_date IS NOT NULL
      AND tse.air_date = CURRENT_DATE
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.push_notification_log pnl
    WHERE pnl.feature = 'tv_episode_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND (pnl.data->>'season')::int = eligible.season_number
      AND (pnl.data->>'episode')::int = eligible.episode_number
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.season_number, eligible.episode_number;
$$;


ALTER FUNCTION "public"."get_pending_tv_episode_reminders"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_pending_tv_episode_reminders"() IS 'Returns episodes airing today for shows users have status=watching, deduped against push_notification_log. Internal use only — called by send-tv-episode-reminders edge function.';



CREATE OR REPLACE FUNCTION "public"."get_season_progress"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer) RETURNS TABLE("season_number" integer, "episodes_watched" bigint, "total_episodes" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ec.season_number,
    COUNT(ew.id) AS episodes_watched,
    COUNT(ec.id) AS total_episodes
  FROM tv_episodes_cache ec
  LEFT JOIN user_episode_watches ew
    ON ew.user_tv_show_id = p_user_tv_show_id
    AND ew.season_number = ec.season_number
    AND ew.episode_number = ec.episode_number
    AND ew.watch_number = 1
  WHERE ec.tmdb_show_id = p_tmdb_show_id
  GROUP BY ec.season_number
  ORDER BY ec.season_number;
END;
$$;


ALTER FUNCTION "public"."get_season_progress"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_suggested_users"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "username" "text", "full_name" "text", "avatar_url" "text", "followers_count" bigint, "mutual_count" bigint, "mutual_usernames" "text"[], "shared_movie_count" bigint, "is_active" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH my_following AS (
    SELECT following_id
    FROM follows
    WHERE follower_id = p_user_id
  ),
  mutual_followers AS (
    SELECT
      f2.following_id AS candidate_id,
      COUNT(*) AS mutual_count,
      ARRAY_AGG(p.username ORDER BY p.username) AS mutual_usernames
    FROM follows f2
    JOIN my_following mf ON mf.following_id = f2.follower_id
    JOIN profiles p ON p.id = f2.follower_id
    WHERE f2.following_id != p_user_id
      AND f2.following_id NOT IN (SELECT following_id FROM my_following)
    GROUP BY f2.following_id
  ),
  similar_taste AS (
    SELECT
      um2.user_id AS candidate_id,
      COUNT(DISTINCT um2.tmdb_id) AS shared_count
    FROM user_movies um1
    JOIN user_movies um2 ON um1.tmdb_id = um2.tmdb_id AND um1.user_id != um2.user_id
    WHERE um1.user_id = p_user_id
      AND um2.user_id != p_user_id
      AND um2.user_id NOT IN (SELECT following_id FROM my_following)
    GROUP BY um2.user_id
    HAVING COUNT(DISTINCT um2.tmdb_id) >= 2
  ),
  recent_activity AS (
    SELECT DISTINCT user_id AS candidate_id, TRUE AS is_active
    FROM (
      SELECT user_id FROM first_takes WHERE created_at > NOW() - INTERVAL '30 days'
      UNION
      SELECT user_id FROM user_movies WHERE added_at > NOW() - INTERVAL '30 days'
    ) active_users
    WHERE user_id != p_user_id
      AND user_id NOT IN (SELECT following_id FROM my_following)
  ),
  candidates AS (
    SELECT COALESCE(mf.candidate_id, st.candidate_id) AS candidate_id,
           COALESCE(mf.mutual_count, 0) AS mutual_count,
           COALESCE(mf.mutual_usernames, ARRAY[]::TEXT[]) AS mutual_usernames,
           COALESCE(st.shared_count, 0) AS shared_count,
           COALESCE(ra.is_active, FALSE) AS is_active
    FROM mutual_followers mf
    FULL OUTER JOIN similar_taste st ON mf.candidate_id = st.candidate_id
    LEFT JOIN recent_activity ra ON COALESCE(mf.candidate_id, st.candidate_id) = ra.candidate_id
  )
  SELECT
    pr.id,
    pr.username,
    pr.full_name,
    pr.avatar_url,
    (SELECT COUNT(*) FROM follows WHERE following_id = pr.id) AS followers_count,
    c.mutual_count,
    c.mutual_usernames,
    c.shared_count AS shared_movie_count,
    c.is_active
  FROM candidates c
  JOIN profiles pr ON pr.id = c.candidate_id
  WHERE pr.username IS NOT NULL
  ORDER BY (c.mutual_count * 3 + c.shared_count * 1 + CASE WHEN c.is_active THEN 2 ELSE 0 END) DESC
  LIMIT 15;
$$;


ALTER FUNCTION "public"."get_suggested_users"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_monthly_activity"("p_user_id" "uuid") RETURNS TABLE("month" "text", "month_label" "text", "count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH months AS (
    SELECT
      TO_CHAR(d, 'YYYY-MM') as month,
      TO_CHAR(d, 'Mon') as month_label,
      d as month_date
    FROM generate_series(
      DATE_TRUNC('month', NOW()) - INTERVAL '5 months',
      DATE_TRUNC('month', NOW()),
      INTERVAL '1 month'
    ) as d
  ),
  activity AS (
    SELECT
      TO_CHAR(added_at, 'YYYY-MM') as month,
      COUNT(*) as count
    FROM user_movies
    WHERE user_id = p_user_id
      AND status = 'watched'
      AND added_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
    GROUP BY TO_CHAR(added_at, 'YYYY-MM')
  )
  SELECT
    m.month,
    m.month_label,
    COALESCE(a.count, 0) as count
  FROM months m
  LEFT JOIN activity a ON m.month = a.month
  ORDER BY m.month_date;
$$;


ALTER FUNCTION "public"."get_user_monthly_activity"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_stats_summary"("p_user_id" "uuid") RETURNS TABLE("total_watched" bigint, "total_first_takes" bigint, "avg_rating" numeric, "total_tv_watched" bigint, "total_episodes_watched" bigint, "total_watch_time_minutes" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.user_movies WHERE user_id = p_user_id AND status = 'watched') as total_watched,
    (SELECT count(*) FROM public.first_takes WHERE user_id = p_user_id AND quote_text IS NOT NULL AND quote_text != '') as total_first_takes,
    (SELECT round(avg(rating)::numeric, 1) FROM public.first_takes WHERE user_id = p_user_id AND rating IS NOT NULL AND quote_text IS NOT NULL AND quote_text != '') as avg_rating,
    (SELECT count(*) FROM public.user_tv_shows WHERE user_id = p_user_id AND status = 'watched') as total_tv_watched,
    (SELECT count(*) FROM public.user_episode_watches WHERE user_id = p_user_id) as total_episodes_watched,
    (SELECT coalesce(sum(episode_runtime), 0) FROM public.user_episode_watches WHERE user_id = p_user_id) as total_watch_time_minutes;
END;
$$;


ALTER FUNCTION "public"."get_user_stats_summary"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_bonus_scans"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_record scan_usage%ROWTYPE;
BEGIN
  -- Upsert and reset if new day
  INSERT INTO scan_usage (user_id, daily_count, last_scan_date, lifetime_scans, bonus_scans)
  VALUES (p_user_id, 0, v_today, 0, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET
    daily_count = CASE WHEN scan_usage.last_scan_date < v_today THEN 0 ELSE scan_usage.daily_count END,
    bonus_scans = CASE WHEN scan_usage.last_scan_date < v_today THEN 0 ELSE scan_usage.bonus_scans END,
    last_scan_date = v_today;

  -- Increment bonus
  UPDATE scan_usage SET bonus_scans = COALESCE(bonus_scans, 0) + 1, updated_at = now() WHERE user_id = p_user_id;

  -- Return updated status
  SELECT * INTO v_record FROM scan_usage WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'bonus_scans', v_record.bonus_scans,
    'scans_remaining', GREATEST(0, (3 + v_record.bonus_scans) - v_record.daily_count)
  );
END;
$$;


ALTER FUNCTION "public"."increment_bonus_scans"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_air_date date;
  v_latest_season int;
  v_latest_episode int;
  v_show_total_seasons int;
  v_tmdb_status text;
  v_flipped boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Phase 4c.3c air_date guard (restrictive / fail-closed).
  -- Mirrors the client-side filter in lib/tv-show-service.ts (PR #390);
  -- this server-side check catches widget and Shortcuts callers that
  -- bypass the TS surface. Both enforcement points must stay in sync
  -- if the eligibility rule ever changes.
  SELECT air_date INTO v_air_date
  FROM public.tv_show_episodes
  WHERE tmdb_show_id = p_tmdb_show_id
    AND season_number = p_season_number
    AND episode_number = p_episode_number;

  IF NOT FOUND OR v_air_date IS NULL OR v_air_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Episode not eligible to mark watched'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotent insert (unchanged from #391).
  IF NOT EXISTS (
    SELECT 1 FROM public.user_episode_watches
    WHERE user_id = v_user_id
      AND user_tv_show_id = p_user_tv_show_id
      AND season_number = p_season_number
      AND episode_number = p_episode_number
  ) THEN
    INSERT INTO public.user_episode_watches (
      user_id, user_tv_show_id, tmdb_show_id,
      season_number, episode_number, watch_number,
      watched_at, created_at
    )
    VALUES (
      v_user_id, p_user_tv_show_id, p_tmdb_show_id,
      p_season_number, p_episode_number, 1,
      NOW(), NOW()
    );
  END IF;

  -- Recompute current_season / current_episode (unchanged).
  SELECT season_number, episode_number
    INTO v_latest_season, v_latest_episode
  FROM public.user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND user_id = v_user_id
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  UPDATE public.user_tv_shows
  SET current_season = v_latest_season,
      current_episode = v_latest_episode,
      updated_at = NOW()
  WHERE id = p_user_tv_show_id
    AND user_id = v_user_id;

  -- Auto-flip branch (unchanged from #389 / #391).
  SELECT number_of_seasons, tmdb_status
    INTO v_show_total_seasons, v_tmdb_status
  FROM public.user_tv_shows
  WHERE id = p_user_tv_show_id AND user_id = v_user_id;

  IF v_show_total_seasons IS NOT NULL
     AND v_latest_season >= v_show_total_seasons
     AND p_total_episodes_in_season > 0
     AND v_latest_episode >= p_total_episodes_in_season
     AND v_tmdb_status IN ('Ended', 'Canceled')
  THEN
    UPDATE public.user_tv_shows
    SET status = 'watched',
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = p_user_tv_show_id
      AND user_id = v_user_id
      AND status <> 'watched';

    IF FOUND THEN
      v_flipped := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('flipped', v_flipped);
END;
$$;


ALTER FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_followers_on_full_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  follower_record RECORD;
BEGIN
  FOR follower_record IN
    SELECT f.follower_id
    FROM follows f
    INNER JOIN user_movies um ON um.user_id = f.follower_id AND um.tmdb_id = NEW.tmdb_id
    WHERE f.following_id = NEW.user_id
      AND f.follower_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, actor_id, type, data, read)
    VALUES (
      follower_record.follower_id,
      NEW.user_id,
      'friend_reviewed',
      jsonb_build_object(
        'tmdb_id', NEW.tmdb_id,
        'movie_title', NEW.movie_title,
        'review_id', NEW.id
      ),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_followers_on_full_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_followers_on_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  follower_record RECORD;
BEGIN
  -- Find followers of the reviewer who also have this movie in user_movies (any status)
  FOR follower_record IN
    SELECT f.follower_id
    FROM follows f
    INNER JOIN user_movies um ON um.user_id = f.follower_id AND um.tmdb_id = NEW.tmdb_id
    WHERE f.following_id = NEW.user_id
      AND f.follower_id != NEW.user_id  -- Don't notify self
  LOOP
    -- Insert notification, skip duplicates silently
    INSERT INTO notifications (user_id, actor_id, type, data, read)
    VALUES (
      follower_record.follower_id,
      NEW.user_id,
      'friend_reviewed',
      jsonb_build_object(
        'tmdb_id', NEW.tmdb_id,
        'movie_title', NEW.movie_title,
        'first_take_id', NEW.id
      ),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_followers_on_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_list_movies"("p_list_id" "uuid", "p_ordered_tmdb_ids" integer[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE list_movies
  SET position = t.idx - 1
  FROM unnest(p_ordered_tmdb_ids) WITH ORDINALITY AS t(tmdb_id, idx)
  WHERE list_movies.list_id = p_list_id
    AND list_movies.tmdb_id = t.tmdb_id;

  UPDATE user_lists
  SET updated_at = now()
  WHERE id = p_list_id;
END;
$$;


ALTER FUNCTION "public"."reorder_list_movies"("p_list_id" "uuid", "p_ordered_tmdb_ids" integer[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "screenshot_url" "text",
    "app_version" "text",
    "platform" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feature_requests_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'triaged'::"text", 'planned'::"text", 'shipped'::"text", 'declined'::"text"]))),
    CONSTRAINT "feature_requests_type_check" CHECK (("type" = ANY (ARRAY['feature_request'::"text", 'feedback'::"text"])))
);


ALTER TABLE "public"."feature_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."feature_requests" IS 'PRD-5 user-submitted feature requests and feedback. Inserts are gated by submit_feature_request() RPC (rate-limit enforced).';



CREATE OR REPLACE FUNCTION "public"."submit_feature_request"("p_type" "text", "p_title" "text", "p_description" "text", "p_screenshot_url" "text", "p_app_version" "text", "p_platform" "text") RETURNS "public"."feature_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recent_count INTEGER;
  v_row public.feature_requests;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit feedback.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate type early so the CHECK constraint error doesn't surface as a
  -- generic 23514 to clients.
  IF p_type NOT IN ('feature_request', 'feedback') THEN
    RAISE EXCEPTION 'Invalid submission type.'
      USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required.' USING ERRCODE = '22023';
  END IF;

  IF p_description IS NULL OR length(btrim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Description is required.' USING ERRCODE = '22023';
  END IF;

  IF length(p_title) > 100 THEN
    RAISE EXCEPTION 'Title must be 100 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  IF length(p_description) > 1000 THEN
    RAISE EXCEPTION 'Description must be 1000 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  -- Rate limit: 5 submissions per user per 24 hours.
  SELECT COUNT(*)
    INTO v_recent_count
    FROM public.feature_requests
   WHERE user_id = v_user_id
     AND created_at > NOW() - INTERVAL '24 hours';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'You''ve reached the limit of 5 submissions in 24 hours. Please try again tomorrow.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.feature_requests (
    user_id,
    type,
    title,
    description,
    screenshot_url,
    app_version,
    platform
  )
  VALUES (
    v_user_id,
    p_type,
    p_title,
    p_description,
    NULLIF(p_screenshot_url, ''),
    NULLIF(p_app_version, ''),
    NULLIF(p_platform, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."submit_feature_request"("p_type" "text", "p_title" "text", "p_description" "text", "p_screenshot_url" "text", "p_app_version" "text", "p_platform" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_feature_request"("p_type" "text", "p_title" "text", "p_description" "text", "p_screenshot_url" "text", "p_app_version" "text", "p_platform" "text") IS 'PRD-5: insert a feature_request as the calling user, enforcing the 5-per-24h rate limit. Only insert path — client RLS denies direct INSERT.';



CREATE OR REPLACE FUNCTION "public"."sync_profile_tier"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tier text;
  v_expires timestamptz;
BEGIN
  -- Check for active 'plus' subscription
  SELECT 'plus', expires_at
  INTO v_tier, v_expires
  FROM subscriptions
  WHERE user_id = p_user_id
    AND entitlement_id = 'plus'
    AND status IN ('active', 'grace_period')
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at DESC NULLS LAST
  LIMIT 1;

  -- Never downgrade dev accounts
  IF (SELECT account_tier FROM profiles WHERE id = p_user_id) = 'dev' THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET account_tier = COALESCE(v_tier, 'free'),
      tier_expires_at = v_expires,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."sync_profile_tier"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_episodes_watched integer;
  v_current_season integer;
  v_current_episode integer;
BEGIN
  -- Count unique episodes watched (only first watches)
  SELECT COUNT(*)
  INTO v_episodes_watched
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND watch_number = 1;

  -- Get the latest episode watched (by season then episode number)
  SELECT season_number, episode_number
  INTO v_current_season, v_current_episode
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND watch_number = 1
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  -- Update the user_tv_shows record
  UPDATE user_tv_shows
  SET
    episodes_watched = v_episodes_watched,
    current_season = v_current_season,
    current_episode = v_current_episode,
    updated_at = now()
  WHERE id = p_user_tv_show_id;
END;
$$;


ALTER FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_id IS NOT NULL THEN
      UPDATE reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
    ELSIF NEW.first_take_id IS NOT NULL THEN
      UPDATE first_takes SET comment_count = comment_count + 1 WHERE id = NEW.first_take_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.review_id IS NOT NULL THEN
      UPDATE reviews SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.review_id;
    ELSIF OLD.first_take_id IS NOT NULL THEN
      UPDATE first_takes SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.first_take_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_comment_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_comment_id uuid;
  v_review_id uuid;
  v_first_take_id uuid;
  v_author_id uuid;
BEGIN
  -- Get the comment_id from NEW (insert) or OLD (delete)
  IF TG_OP = 'INSERT' THEN
    v_comment_id := NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_comment_id := OLD.comment_id;
  END IF;

  -- Get the review_id and first_take_id from the comment
  SELECT review_id, first_take_id
    INTO v_review_id, v_first_take_id
    FROM review_comments
   WHERE id = v_comment_id;

  -- Determine the author of the review/first_take
  IF v_review_id IS NOT NULL THEN
    SELECT user_id INTO v_author_id
      FROM reviews
     WHERE id = v_review_id;
  ELSIF v_first_take_id IS NOT NULL THEN
    SELECT user_id INTO v_author_id
      FROM first_takes
     WHERE id = v_first_take_id;
  END IF;

  -- Update like_count and liked_by_author on the comment
  UPDATE review_comments
     SET like_count = (
           SELECT count(*)
             FROM comment_likes
            WHERE comment_id = v_comment_id
         ),
         liked_by_author = (
           CASE
             WHEN v_author_id IS NOT NULL THEN
               EXISTS(
                 SELECT 1
                   FROM comment_likes
                  WHERE comment_id = v_comment_id
                    AND user_id = v_author_id
               )
             ELSE false
           END
         )
   WHERE id = v_comment_id;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_comment_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_follow_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Follower gains +1 following
    UPDATE public.profiles
    SET following_count = COALESCE(following_count, 0) + 1
    WHERE id = NEW.follower_id;

    -- Followee gains +1 follower
    UPDATE public.profiles
    SET followers_count = COALESCE(followers_count, 0) + 1
    WHERE id = NEW.following_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Follower loses 1 following (floor at 0)
    UPDATE public.profiles
    SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0)
    WHERE id = OLD.follower_id;

    -- Followee loses 1 follower (floor at 0)
    UPDATE public.profiles
    SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0)
    WHERE id = OLD.following_id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_follow_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_id IS NOT NULL THEN
      UPDATE public.reviews SET like_count = like_count + 1 WHERE id = NEW.review_id;
    ELSIF NEW.first_take_id IS NOT NULL THEN
      UPDATE public.first_takes SET like_count = like_count + 1 WHERE id = NEW.first_take_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.review_id IS NOT NULL THEN
      UPDATE public.reviews SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.review_id;
    ELSIF OLD.first_take_id IS NOT NULL THEN
      UPDATE public.first_takes SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.first_take_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievement_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "level" integer NOT NULL,
    "criteria_value" integer NOT NULL,
    "description" "text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievement_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" DEFAULT '🏆'::"text" NOT NULL,
    "criteria_type" "text" NOT NULL,
    "criteria_value" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_revocable" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "function_name" "text" NOT NULL,
    "model" "text" NOT NULL,
    "estimated_cost_usd" numeric(10,6) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage_costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_users_check" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocked_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comment_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."first_takes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "movie_title" "text" NOT NULL,
    "poster_path" "text",
    "reaction_emoji" "text" DEFAULT '🎬'::"text" NOT NULL,
    "quote_text" character varying(500) NOT NULL,
    "is_spoiler" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rating" numeric(3,1),
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "media_type" "text" DEFAULT 'movie'::"text" NOT NULL,
    "season_number" integer,
    "episode_number" integer,
    "show_name" "text",
    "title" character varying(100),
    "is_rewatch" boolean DEFAULT false,
    "like_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    CONSTRAINT "first_takes_media_type_check" CHECK (("media_type" = ANY (ARRAY['movie'::"text", 'tv_show'::"text", 'tv_season'::"text", 'tv_episode'::"text"]))),
    CONSTRAINT "first_takes_quote_text_length_check" CHECK (("char_length"(("quote_text")::"text") <= 2000)),
    CONSTRAINT "first_takes_rating_check" CHECK ((("rating" >= (1)::numeric) AND ("rating" <= (10)::numeric))),
    CONSTRAINT "first_takes_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'followers_only'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."first_takes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."first_takes"."reaction_emoji" IS 'DEPRECATED: Use rating column instead. Kept for backwards compatibility.';



CREATE TABLE IF NOT EXISTS "public"."follow_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."follow_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "follows_check" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."genres" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "media_type" "text" DEFAULT 'movie'::"text" NOT NULL,
    CONSTRAINT "genres_media_type_check" CHECK (("media_type" = ANY (ARRAY['movie'::"text", 'tv'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."genres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ip_rate_limits" (
    "ip_address" "text" NOT NULL,
    "action" "text" NOT NULL,
    "window_count" integer DEFAULT 1 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ip_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."list_movies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "title" "text" NOT NULL,
    "poster_path" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "media_type" "text" DEFAULT 'movie'::"text" NOT NULL,
    CONSTRAINT "list_movies_media_type_check" CHECK (("media_type" = ANY (ARRAY['movie'::"text", 'tv_show'::"text"])))
);


ALTER TABLE "public"."list_movies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movies" (
    "id" integer NOT NULL,
    "tmdb_id" integer NOT NULL,
    "imdb_id" "text",
    "title" "text" NOT NULL,
    "original_title" "text",
    "tagline" "text",
    "overview" "text",
    "release_date" "date",
    "runtime_minutes" integer,
    "status" "text",
    "tmdb_vote_average" numeric(3,1),
    "tmdb_vote_count" integer,
    "genre_ids" integer[],
    "adult" boolean DEFAULT false,
    "original_language" "text",
    "poster_path" "text",
    "backdrop_path" "text",
    "tmdb_popularity" numeric(10,3),
    "budget" bigint,
    "revenue" bigint,
    "tmdb_fetched_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "trailer_youtube_key" "text",
    "trailer_name" "text",
    "cached_cast" "jsonb",
    "cached_crew" "jsonb",
    "imdb_rating" numeric(3,1),
    "imdb_votes" integer,
    "rotten_tomatoes_score" integer,
    "metacritic_score" integer,
    "external_ratings_fetched_at" timestamp with time zone
);


ALTER TABLE "public"."movies" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."movies_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."movies_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."movies_id_seq" OWNED BY "public"."movies"."id";



CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "actor_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "bio" "text",
    "first_take_prompt_enabled" boolean DEFAULT true,
    "theme_preference" "text" DEFAULT 'system'::"text",
    "onboarding_completed" boolean DEFAULT false,
    "followers_count" integer DEFAULT 0,
    "following_count" integer DEFAULT 0,
    "account_tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "tier_expires_at" timestamp with time zone,
    "review_visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "feed_last_seen_at" timestamp with time zone,
    "content_mode" "text" DEFAULT 'both'::"text" NOT NULL,
    "default_collection_view" "text" DEFAULT 'movies'::"text" NOT NULL,
    "show_continue_watching" boolean DEFAULT true NOT NULL,
    "calendar_default_filters" "jsonb" DEFAULT '{"release_types": [1, 2, 3, 4, 5, 6]}'::"jsonb",
    "is_private" boolean DEFAULT false NOT NULL,
    "pending_followers_count" integer DEFAULT 0 NOT NULL,
    "rewarded_ad_credits" integer DEFAULT 0 NOT NULL,
    "crop_ticket_photos" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_account_tier_check" CHECK (("account_tier" = ANY (ARRAY['free'::"text", 'premium'::"text", 'dev'::"text"]))),
    CONSTRAINT "profiles_content_mode_check" CHECK (("content_mode" = ANY (ARRAY['movies'::"text", 'tv_shows'::"text", 'both'::"text"]))),
    CONSTRAINT "profiles_review_visibility_check" CHECK (("review_visibility" = ANY (ARRAY['public'::"text", 'followers_only'::"text", 'private'::"text"]))),
    CONSTRAINT "profiles_theme_preference_check" CHECK (("theme_preference" = ANY (ARRAY['light'::"text", 'dark'::"text", 'system'::"text"]))),
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."theme_preference" IS 'User theme preference: light, dark, or system (follows device setting)';



CREATE TABLE IF NOT EXISTS "public"."push_notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "ticket_id" "text",
    "feature" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "receipt_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_notification_log_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'invalid_token'::"text"])))
);


ALTER TABLE "public"."push_notification_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "window_count" integer DEFAULT 0 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."release_calendar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tmdb_id" integer NOT NULL,
    "region" "text" DEFAULT 'US'::"text" NOT NULL,
    "release_type" integer NOT NULL,
    "release_date" "date" NOT NULL,
    "certification" "text",
    "note" "text",
    "fetched_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "poster_path" "text",
    "backdrop_path" "text",
    "genre_ids" integer[],
    "vote_average" numeric,
    "trailer_youtube_key" "text"
);


ALTER TABLE "public"."release_calendar" OWNER TO "postgres";


COMMENT ON TABLE "public"."release_calendar" IS 'TMDB-sourced release calendar. Denormalized for single-query client reads via PostgREST. Populated daily by warm-release-calendar edge function via pg_cron. Unique on (tmdb_id, region, release_type).';



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_reason_check" CHECK (("reason" = ANY (ARRAY['spam'::"text", 'harassment'::"text", 'inappropriate'::"text", 'hate_speech'::"text", 'other'::"text"]))),
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['user'::"text", 'review'::"text", 'comment'::"text", 'first_take'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid",
    "first_take_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "parent_comment_id" "uuid",
    "body" "text" NOT NULL,
    "is_spoiler" boolean DEFAULT false,
    "report_count" integer DEFAULT 0,
    "is_hidden" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "like_count" integer DEFAULT 0 NOT NULL,
    "liked_by_author" boolean DEFAULT false NOT NULL,
    CONSTRAINT "comment_target_check" CHECK (((("review_id" IS NOT NULL) AND ("first_take_id" IS NULL)) OR (("review_id" IS NULL) AND ("first_take_id" IS NOT NULL)))),
    CONSTRAINT "review_comments_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 500)))
);


ALTER TABLE "public"."review_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "review_id" "uuid",
    "first_take_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "review_likes_one_target" CHECK (((("review_id" IS NOT NULL) AND ("first_take_id" IS NULL)) OR (("review_id" IS NULL) AND ("first_take_id" IS NOT NULL))))
);


ALTER TABLE "public"."review_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "media_type" "text" DEFAULT 'movie'::"text" NOT NULL,
    "movie_title" "text" NOT NULL,
    "poster_path" "text",
    "title" "text" NOT NULL,
    "review_text" "text" NOT NULL,
    "rating" integer NOT NULL,
    "is_spoiler" boolean DEFAULT false NOT NULL,
    "is_rewatch" boolean DEFAULT false NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "like_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    CONSTRAINT "reviews_media_type_check" CHECK (("media_type" = ANY (ARRAY['movie'::"text", 'tv_show'::"text"]))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 10))),
    CONSTRAINT "reviews_review_text_check" CHECK (("char_length"("review_text") <= 2000)),
    CONSTRAINT "reviews_title_check" CHECK (("char_length"("title") <= 100)),
    CONSTRAINT "reviews_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'followers_only'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_usage" (
    "user_id" "uuid" NOT NULL,
    "daily_count" integer DEFAULT 0,
    "last_scan_date" "date" DEFAULT CURRENT_DATE,
    "lifetime_scans" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bypass_rate_limit" boolean DEFAULT false,
    "bonus_scans" integer DEFAULT 0
);


ALTER TABLE "public"."scan_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "revenuecat_customer_id" "text" NOT NULL,
    "entitlement_id" "text" DEFAULT 'plus'::"text" NOT NULL,
    "product_id" "text" NOT NULL,
    "store" "text" NOT NULL,
    "store_transaction_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "grace_period_expires_at" timestamp with time zone,
    "is_trial" boolean DEFAULT false,
    "trial_start_at" timestamp with time zone,
    "trial_end_at" timestamp with time zone,
    "environment" "text" DEFAULT 'production'::"text",
    "raw_event" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."theater_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "movie_title" "text" NOT NULL,
    "theater_name" "text",
    "theater_chain" "text",
    "show_date" "date",
    "show_time" time without time zone,
    "seat_row" "text",
    "seat_number" "text",
    "auditorium" "text",
    "format" "text",
    "price_amount" numeric(10,2),
    "price_currency" "text" DEFAULT 'USD'::"text",
    "ticket_type" "text",
    "confirmation_number" "text",
    "is_verified" boolean DEFAULT true,
    "confidence_score" numeric(3,2),
    "scan_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ticket_image_url" "text"
);


ALTER TABLE "public"."theater_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_scans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "journey_id" "uuid",
    "barcode_data" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_scans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tv_episodes_cache" (
    "id" bigint NOT NULL,
    "tmdb_show_id" integer NOT NULL,
    "season_number" integer NOT NULL,
    "episode_number" integer NOT NULL,
    "name" "text",
    "overview" "text",
    "air_date" "text",
    "runtime" integer,
    "still_path" "text",
    "tmdb_vote_average" numeric,
    "tmdb_vote_count" integer,
    "guest_stars" "jsonb",
    "tmdb_fetched_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tv_episodes_cache" OWNER TO "postgres";


ALTER TABLE "public"."tv_episodes_cache" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tv_episodes_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tv_show_episodes" (
    "tmdb_show_id" integer NOT NULL,
    "season_number" integer NOT NULL,
    "episode_number" integer NOT NULL,
    "name" "text",
    "overview" "text",
    "air_date" "date",
    "runtime" integer,
    "still_path" "text",
    "tmdb_vote_average" numeric,
    "tmdb_vote_count" integer,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tv_show_episodes" OWNER TO "postgres";


COMMENT ON TABLE "public"."tv_show_episodes" IS 'Shared TMDB-sourced per-episode catalog. Populated lazily by the get-season-episodes edge function on every fetch. Keyed by (tmdb_show_id, season_number, episode_number) — no user_id because data is shared across the user base. Drives Phase 4c.3c server-side air_date validation and 4c.3e widget UX (airing countdowns, unaired button disable).';



CREATE TABLE IF NOT EXISTS "public"."tv_shows" (
    "id" bigint NOT NULL,
    "tmdb_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "original_name" "text",
    "overview" "text",
    "tagline" "text",
    "first_air_date" "text",
    "last_air_date" "text",
    "status" "text",
    "type" "text",
    "in_production" boolean,
    "number_of_seasons" integer,
    "number_of_episodes" integer,
    "episode_run_time" integer[],
    "poster_path" "text",
    "backdrop_path" "text",
    "genre_ids" integer[],
    "original_language" "text",
    "origin_country" "text"[],
    "adult" boolean DEFAULT false,
    "tmdb_popularity" numeric,
    "tmdb_vote_average" numeric,
    "tmdb_vote_count" integer,
    "networks" "jsonb",
    "created_by" "jsonb",
    "cached_cast" "jsonb",
    "cached_crew" "jsonb",
    "trailer_youtube_key" "text",
    "trailer_name" "text",
    "cached_seasons" "jsonb",
    "tmdb_fetched_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tv_shows" OWNER TO "postgres";


ALTER TABLE "public"."tv_shows" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tv_shows_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "user_id" "uuid" NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "level" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_episode_watches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_tv_show_id" "uuid" NOT NULL,
    "tmdb_show_id" integer NOT NULL,
    "season_number" integer NOT NULL,
    "episode_number" integer NOT NULL,
    "episode_name" "text",
    "still_path" "text",
    "episode_runtime" integer,
    "watched_at" timestamp with time zone DEFAULT "now"(),
    "watch_number" integer DEFAULT 1,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_episode_watches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cover_image_url" "text",
    CONSTRAINT "user_lists_description_length_check" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 1000))),
    CONSTRAINT "user_lists_name_length_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 200)))
);


ALTER TABLE "public"."user_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_movie_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "title" "text" NOT NULL,
    "poster_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_movie_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_popcorn" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "reference_id" "text",
    "seed" integer NOT NULL,
    "is_milestone" boolean DEFAULT false NOT NULL,
    "achievement_id" "uuid",
    "is_retroactive" boolean DEFAULT false NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_popcorn" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_streaming_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider_id" integer NOT NULL,
    "provider_name" "text" NOT NULL,
    "provider_logo_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_streaming_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tv_show_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "poster_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_tv_show_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tv_shows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tmdb_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "poster_path" "text",
    "backdrop_path" "text",
    "overview" "text",
    "first_air_date" "text",
    "genre_ids" integer[],
    "vote_average" numeric,
    "number_of_seasons" integer,
    "number_of_episodes" integer,
    "status" "text" DEFAULT 'watchlist'::"text" NOT NULL,
    "episodes_watched" integer DEFAULT 0,
    "current_season" integer,
    "current_episode" integer,
    "user_rating" numeric,
    "is_liked" boolean DEFAULT false,
    "added_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "started_watching_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "metadata_refreshed_at" timestamp with time zone,
    "tmdb_status" "text",
    CONSTRAINT "user_tv_shows_status_check" CHECK (("status" = ANY (ARRAY['watchlist'::"text", 'watching'::"text", 'watched'::"text", 'dropped'::"text", 'on_hold'::"text"]))),
    CONSTRAINT "user_tv_shows_user_rating_check" CHECK ((("user_rating" >= (1)::numeric) AND ("user_rating" <= (10)::numeric)))
);


ALTER TABLE "public"."user_tv_shows" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_tv_shows"."tmdb_status" IS 'TMDB show status: "Ended", "Returning Series", "Canceled", "In Production", "Planned", "Pilot". Refreshed by lib/metadata-refresh.ts. Drives auto status transitions and future widget UI.';



CREATE TABLE IF NOT EXISTS "public"."watchlist_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "watchlist_comments_text_check" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 500)))
);


ALTER TABLE "public"."watchlist_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watchlist_likes" (
    "user_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."watchlist_likes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."movies" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."movies_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."achievement_levels"
    ADD CONSTRAINT "achievement_levels_achievement_id_level_key" UNIQUE ("achievement_id", "level");



ALTER TABLE ONLY "public"."achievement_levels"
    ADD CONSTRAINT "achievement_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_costs"
    ADD CONSTRAINT "ai_usage_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_user_id_comment_id_key" UNIQUE ("user_id", "comment_id");



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_comment_id_reporter_id_key" UNIQUE ("comment_id", "reporter_id");



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."first_takes"
    ADD CONSTRAINT "first_takes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_requester_id_target_id_key" UNIQUE ("requester_id", "target_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."genres"
    ADD CONSTRAINT "genres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ip_rate_limits"
    ADD CONSTRAINT "ip_rate_limits_pkey" PRIMARY KEY ("ip_address", "action");



ALTER TABLE ONLY "public"."list_movies"
    ADD CONSTRAINT "list_movies_list_id_tmdb_id_media_type_key" UNIQUE ("list_id", "tmdb_id", "media_type");



ALTER TABLE ONLY "public"."list_movies"
    ADD CONSTRAINT "list_movies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movies"
    ADD CONSTRAINT "movies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movies"
    ADD CONSTRAINT "movies_tmdb_id_key" UNIQUE ("tmdb_id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_feature_key" UNIQUE ("user_id", "feature");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."push_notification_log"
    ADD CONSTRAINT "push_notification_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("user_id", "action");



ALTER TABLE ONLY "public"."release_calendar"
    ADD CONSTRAINT "release_calendar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."release_calendar"
    ADD CONSTRAINT "release_calendar_tmdb_id_region_release_type_key" UNIQUE ("tmdb_id", "region", "release_type");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_target_type_target_id_key" UNIQUE ("reporter_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."review_comments"
    ADD CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_likes"
    ADD CONSTRAINT "review_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_likes"
    ADD CONSTRAINT "review_likes_unique_first_take" UNIQUE ("user_id", "first_take_id");



ALTER TABLE ONLY "public"."review_likes"
    ADD CONSTRAINT "review_likes_unique_review" UNIQUE ("user_id", "review_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_tmdb_id_media_type_key" UNIQUE ("user_id", "tmdb_id", "media_type");



ALTER TABLE ONLY "public"."scan_usage"
    ADD CONSTRAINT "scan_usage_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_product_id_store_transaction_id_key" UNIQUE ("user_id", "product_id", "store_transaction_id");



ALTER TABLE ONLY "public"."theater_visits"
    ADD CONSTRAINT "theater_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_scans"
    ADD CONSTRAINT "ticket_scans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tv_episodes_cache"
    ADD CONSTRAINT "tv_episodes_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tv_episodes_cache"
    ADD CONSTRAINT "tv_episodes_cache_tmdb_show_id_season_number_episode_number_key" UNIQUE ("tmdb_show_id", "season_number", "episode_number");



ALTER TABLE ONLY "public"."tv_show_episodes"
    ADD CONSTRAINT "tv_show_episodes_pkey" PRIMARY KEY ("tmdb_show_id", "season_number", "episode_number");



ALTER TABLE ONLY "public"."tv_shows"
    ADD CONSTRAINT "tv_shows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tv_shows"
    ADD CONSTRAINT "tv_shows_tmdb_id_key" UNIQUE ("tmdb_id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "achievement_id", "level");



ALTER TABLE ONLY "public"."user_episode_watches"
    ADD CONSTRAINT "user_episode_watches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_lists"
    ADD CONSTRAINT "user_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_movie_likes"
    ADD CONSTRAINT "user_movie_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_movie_likes"
    ADD CONSTRAINT "user_movie_likes_user_id_tmdb_id_key" UNIQUE ("user_id", "tmdb_id");



ALTER TABLE ONLY "public"."user_movies"
    ADD CONSTRAINT "user_movies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_popcorn"
    ADD CONSTRAINT "user_popcorn_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_popcorn"
    ADD CONSTRAINT "user_popcorn_user_id_action_type_reference_id_key" UNIQUE NULLS NOT DISTINCT ("user_id", "action_type", "reference_id");



ALTER TABLE ONLY "public"."user_streaming_services"
    ADD CONSTRAINT "user_streaming_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_streaming_services"
    ADD CONSTRAINT "user_streaming_services_user_id_provider_id_key" UNIQUE ("user_id", "provider_id");



ALTER TABLE ONLY "public"."user_tv_show_likes"
    ADD CONSTRAINT "user_tv_show_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tv_show_likes"
    ADD CONSTRAINT "user_tv_show_likes_user_id_tmdb_id_key" UNIQUE ("user_id", "tmdb_id");



ALTER TABLE ONLY "public"."user_tv_shows"
    ADD CONSTRAINT "user_tv_shows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tv_shows"
    ADD CONSTRAINT "user_tv_shows_user_id_tmdb_id_key" UNIQUE ("user_id", "tmdb_id");



ALTER TABLE ONLY "public"."user_movies"
    ADD CONSTRAINT "user_unique_user_movie_journey" UNIQUE ("user_id", "tmdb_id", "journey_number");



ALTER TABLE ONLY "public"."watchlist_comments"
    ADD CONSTRAINT "watchlist_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watchlist_likes"
    ADD CONSTRAINT "watchlist_likes_pkey" PRIMARY KEY ("user_id", "owner_id");



CREATE INDEX "idx_achievement_levels_achievement_id" ON "public"."achievement_levels" USING "btree" ("achievement_id");



CREATE INDEX "idx_ai_usage_costs_created_at" ON "public"."ai_usage_costs" USING "btree" ("created_at");



CREATE INDEX "idx_ai_usage_costs_user_id" ON "public"."ai_usage_costs" USING "btree" ("user_id");



CREATE INDEX "idx_blocked_users_blocker_id" ON "public"."blocked_users" USING "btree" ("blocker_id");



CREATE INDEX "idx_comment_likes_comment_id" ON "public"."comment_likes" USING "btree" ("comment_id");



CREATE INDEX "idx_comment_likes_user_id" ON "public"."comment_likes" USING "btree" ("user_id");



CREATE INDEX "idx_comment_reports_comment_id" ON "public"."comment_reports" USING "btree" ("comment_id");



CREATE INDEX "idx_feature_requests_status" ON "public"."feature_requests" USING "btree" ("status");



CREATE INDEX "idx_feature_requests_user" ON "public"."feature_requests" USING "btree" ("user_id");



CREATE INDEX "idx_first_takes_created_at" ON "public"."first_takes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_first_takes_created_user" ON "public"."first_takes" USING "btree" ("created_at" DESC, "user_id");



CREATE INDEX "idx_first_takes_media_type" ON "public"."first_takes" USING "btree" ("media_type");



CREATE UNIQUE INDEX "idx_first_takes_unique_movie" ON "public"."first_takes" USING "btree" ("user_id", "tmdb_id") WHERE ("media_type" = 'movie'::"text");



CREATE UNIQUE INDEX "idx_first_takes_unique_tv_episode" ON "public"."first_takes" USING "btree" ("user_id", "tmdb_id", "season_number", "episode_number") WHERE ("media_type" = 'tv_episode'::"text");



CREATE UNIQUE INDEX "idx_first_takes_unique_tv_season" ON "public"."first_takes" USING "btree" ("user_id", "tmdb_id", "season_number") WHERE ("media_type" = 'tv_season'::"text");



CREATE UNIQUE INDEX "idx_first_takes_unique_tv_show" ON "public"."first_takes" USING "btree" ("user_id", "tmdb_id") WHERE ("media_type" = 'tv_show'::"text");



CREATE INDEX "idx_first_takes_user_created" ON "public"."first_takes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_first_takes_user_id" ON "public"."first_takes" USING "btree" ("user_id");



CREATE INDEX "idx_first_takes_visibility" ON "public"."first_takes" USING "btree" ("visibility");



CREATE INDEX "idx_follow_requests_requester_id" ON "public"."follow_requests" USING "btree" ("requester_id", "created_at" DESC);



CREATE INDEX "idx_follow_requests_target_id" ON "public"."follow_requests" USING "btree" ("target_id", "created_at" DESC);



CREATE INDEX "idx_follows_follower_created" ON "public"."follows" USING "btree" ("follower_id", "created_at" DESC);



CREATE INDEX "idx_follows_following_created" ON "public"."follows" USING "btree" ("following_id", "created_at" DESC);



CREATE INDEX "idx_ip_rate_limits_window_start" ON "public"."ip_rate_limits" USING "btree" ("window_start");



CREATE INDEX "idx_list_movies_list_id" ON "public"."list_movies" USING "btree" ("list_id");



CREATE INDEX "idx_movies_release_date" ON "public"."movies" USING "btree" ("release_date");



CREATE INDEX "idx_movies_tmdb_fetched_at" ON "public"."movies" USING "btree" ("tmdb_fetched_at");



CREATE INDEX "idx_notifications_actor_id" ON "public"."notifications" USING "btree" ("actor_id");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read" = false);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_profiles_is_private" ON "public"."profiles" USING "btree" ("is_private") WHERE ("is_private" = true);



CREATE INDEX "idx_push_log_created_at" ON "public"."push_notification_log" USING "btree" ("created_at");



CREATE INDEX "idx_push_log_feature" ON "public"."push_notification_log" USING "btree" ("feature");



CREATE INDEX "idx_push_log_status" ON "public"."push_notification_log" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'sent'::"text"]));



CREATE INDEX "idx_push_log_user_id" ON "public"."push_notification_log" USING "btree" ("user_id");



CREATE INDEX "idx_push_tokens_last_used" ON "public"."push_tokens" USING "btree" ("last_used_at");



CREATE INDEX "idx_push_tokens_user_id" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_release_calendar_date_region" ON "public"."release_calendar" USING "btree" ("release_date", "region");



CREATE INDEX "idx_release_calendar_tmdb_fetched" ON "public"."release_calendar" USING "btree" ("tmdb_id", "fetched_at");



CREATE INDEX "idx_reports_reporter_id" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "idx_review_comments_first_take_id" ON "public"."review_comments" USING "btree" ("first_take_id") WHERE ("first_take_id" IS NOT NULL);



CREATE INDEX "idx_review_comments_parent" ON "public"."review_comments" USING "btree" ("parent_comment_id") WHERE ("parent_comment_id" IS NOT NULL);



CREATE INDEX "idx_review_comments_review_id" ON "public"."review_comments" USING "btree" ("review_id") WHERE ("review_id" IS NOT NULL);



CREATE INDEX "idx_review_comments_user_id" ON "public"."review_comments" USING "btree" ("user_id");



CREATE INDEX "idx_review_likes_first_take_id" ON "public"."review_likes" USING "btree" ("first_take_id") WHERE ("first_take_id" IS NOT NULL);



CREATE INDEX "idx_review_likes_review_id" ON "public"."review_likes" USING "btree" ("review_id") WHERE ("review_id" IS NOT NULL);



CREATE INDEX "idx_review_likes_user_id" ON "public"."review_likes" USING "btree" ("user_id");



CREATE INDEX "idx_reviews_created_at" ON "public"."reviews" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_reviews_tmdb_id" ON "public"."reviews" USING "btree" ("tmdb_id");



CREATE INDEX "idx_reviews_user_id" ON "public"."reviews" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_revenuecat" ON "public"."subscriptions" USING "btree" ("revenuecat_customer_id");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_theater_visits_date" ON "public"."theater_visits" USING "btree" ("show_date");



CREATE INDEX "idx_theater_visits_theater" ON "public"."theater_visits" USING "btree" ("theater_name");



CREATE INDEX "idx_theater_visits_tmdb_id" ON "public"."theater_visits" USING "btree" ("tmdb_id");



CREATE INDEX "idx_theater_visits_user_id" ON "public"."theater_visits" USING "btree" ("user_id");



CREATE INDEX "idx_tv_episodes_cache_fetched_at" ON "public"."tv_episodes_cache" USING "btree" ("tmdb_fetched_at");



CREATE INDEX "idx_tv_episodes_cache_show_season" ON "public"."tv_episodes_cache" USING "btree" ("tmdb_show_id", "season_number");



CREATE INDEX "idx_tv_shows_genre_ids" ON "public"."tv_shows" USING "gin" ("genre_ids");



CREATE INDEX "idx_tv_shows_tmdb_fetched_at" ON "public"."tv_shows" USING "btree" ("tmdb_fetched_at");



CREATE INDEX "idx_user_achievements_achievement_id" ON "public"."user_achievements" USING "btree" ("achievement_id");



CREATE INDEX "idx_user_achievements_user_id" ON "public"."user_achievements" USING "btree" ("user_id");



CREATE INDEX "idx_user_episode_watches_show_season" ON "public"."user_episode_watches" USING "btree" ("user_tv_show_id", "season_number");



CREATE INDEX "idx_user_episode_watches_show_season_ep" ON "public"."user_episode_watches" USING "btree" ("user_tv_show_id", "season_number", "episode_number");



CREATE UNIQUE INDEX "idx_user_episode_watches_unique_first" ON "public"."user_episode_watches" USING "btree" ("user_id", "tmdb_show_id", "season_number", "episode_number") WHERE ("watch_number" = 1);



CREATE INDEX "idx_user_episode_watches_user_show" ON "public"."user_episode_watches" USING "btree" ("user_id", "tmdb_show_id");



CREATE INDEX "idx_user_episode_watches_user_watched" ON "public"."user_episode_watches" USING "btree" ("user_id", "watched_at" DESC);



CREATE INDEX "idx_user_lists_user_id" ON "public"."user_lists" USING "btree" ("user_id");



CREATE INDEX "idx_user_movie_likes_user" ON "public"."user_movie_likes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_user_movies_status" ON "public"."user_movies" USING "btree" ("user_id", "status");



CREATE INDEX "idx_user_movies_tmdb_user" ON "public"."user_movies" USING "btree" ("tmdb_id", "user_id");



CREATE INDEX "idx_user_movies_watched_at" ON "public"."user_movies" USING "btree" ("user_id", "watched_at");



CREATE INDEX "idx_user_streaming_services_user" ON "public"."user_streaming_services" USING "btree" ("user_id");



CREATE INDEX "idx_user_tv_shows_metadata_refresh" ON "public"."user_tv_shows" USING "btree" ("user_id", "metadata_refreshed_at") WHERE ("status" = 'watching'::"text");



CREATE INDEX "idx_user_tv_shows_updated" ON "public"."user_tv_shows" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_user_tv_shows_user_added" ON "public"."user_tv_shows" USING "btree" ("user_id", "added_at" DESC);



CREATE INDEX "idx_user_tv_shows_user_status" ON "public"."user_tv_shows" USING "btree" ("user_id", "status");



CREATE INDEX "idx_user_tv_shows_user_tmdb" ON "public"."user_tv_shows" USING "btree" ("user_id", "tmdb_id");



CREATE INDEX "idx_watchlist_comments_owner_created" ON "public"."watchlist_comments" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_watchlist_comments_user_id" ON "public"."watchlist_comments" USING "btree" ("user_id");



CREATE INDEX "idx_watchlist_likes_owner" ON "public"."watchlist_likes" USING "btree" ("owner_id");



CREATE INDEX "user_popcorn_action_type_idx" ON "public"."user_popcorn" USING "btree" ("user_id", "action_type");



CREATE INDEX "user_popcorn_user_id_idx" ON "public"."user_popcorn" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "notify-new-user" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/notify-new-user', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "on_follow_change" AFTER INSERT OR DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."update_follow_counts"();



CREATE OR REPLACE TRIGGER "on_new_follow" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."create_follow_notification"();



CREATE OR REPLACE TRIGGER "on_profile_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_comment_likes_count" AFTER INSERT OR DELETE ON "public"."comment_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_comment_like_count"();



CREATE OR REPLACE TRIGGER "trg_notify_followers_first_take" AFTER INSERT ON "public"."first_takes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_followers_on_review"();



CREATE OR REPLACE TRIGGER "trg_notify_followers_review" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."notify_followers_on_full_review"();



CREATE OR REPLACE TRIGGER "trg_review_likes_delete" AFTER DELETE ON "public"."review_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_like_count"();



CREATE OR REPLACE TRIGGER "trg_review_likes_insert" AFTER INSERT ON "public"."review_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_like_count"();



CREATE OR REPLACE TRIGGER "trg_update_comment_count" AFTER INSERT OR DELETE ON "public"."review_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_comment_count"();



CREATE OR REPLACE TRIGGER "update_user_movies_updated_at" BEFORE UPDATE ON "public"."user_movies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."achievement_levels"
    ADD CONSTRAINT "achievement_levels_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_costs"
    ADD CONSTRAINT "ai_usage_costs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."review_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."review_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reports"
    ADD CONSTRAINT "comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."first_takes"
    ADD CONSTRAINT "first_takes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."first_takes"
    ADD CONSTRAINT "first_takes_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."list_movies"
    ADD CONSTRAINT "list_movies_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."user_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_log"
    ADD CONSTRAINT "push_notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_comments"
    ADD CONSTRAINT "review_comments_first_take_id_fkey" FOREIGN KEY ("first_take_id") REFERENCES "public"."first_takes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_comments"
    ADD CONSTRAINT "review_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."review_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_comments"
    ADD CONSTRAINT "review_comments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_comments"
    ADD CONSTRAINT "review_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_likes"
    ADD CONSTRAINT "review_likes_first_take_id_fkey" FOREIGN KEY ("first_take_id") REFERENCES "public"."first_takes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_likes"
    ADD CONSTRAINT "review_likes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_likes"
    ADD CONSTRAINT "review_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_usage"
    ADD CONSTRAINT "scan_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."theater_visits"
    ADD CONSTRAINT "theater_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_scans"
    ADD CONSTRAINT "ticket_scans_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "public"."user_movies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_scans"
    ADD CONSTRAINT "ticket_scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_episode_watches"
    ADD CONSTRAINT "user_episode_watches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_episode_watches"
    ADD CONSTRAINT "user_episode_watches_user_tv_show_id_fkey" FOREIGN KEY ("user_tv_show_id") REFERENCES "public"."user_tv_shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_lists"
    ADD CONSTRAINT "user_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_movie_likes"
    ADD CONSTRAINT "user_movie_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_movies"
    ADD CONSTRAINT "user_movies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_popcorn"
    ADD CONSTRAINT "user_popcorn_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id");



ALTER TABLE ONLY "public"."user_popcorn"
    ADD CONSTRAINT "user_popcorn_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_streaming_services"
    ADD CONSTRAINT "user_streaming_services_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tv_show_likes"
    ADD CONSTRAINT "user_tv_show_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tv_shows"
    ADD CONSTRAINT "user_tv_shows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist_comments"
    ADD CONSTRAINT "watchlist_comments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist_comments"
    ADD CONSTRAINT "watchlist_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist_likes"
    ADD CONSTRAINT "watchlist_likes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watchlist_likes"
    ADD CONSTRAINT "watchlist_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Achievement levels are viewable by everyone" ON "public"."achievement_levels" FOR SELECT USING (true);



CREATE POLICY "Achievements are viewable by everyone" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "Anyone can read non-hidden comments" ON "public"."review_comments" FOR SELECT USING (("is_hidden" = false));



CREATE POLICY "Anyone can read public reviews" ON "public"."reviews" FOR SELECT USING (("visibility" = 'public'::"text"));



CREATE POLICY "Anyone can read review_likes" ON "public"."review_likes" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can cache movies" ON "public"."movies" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can cache tv episodes" ON "public"."tv_episodes_cache" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can cache tv shows" ON "public"."tv_shows" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can comment on public watchlists" ON "public"."watchlist_comments" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "watchlist_comments"."owner_id") AND ("profiles"."review_visibility" = 'public'::"text"))))));



CREATE POLICY "Authenticated users can insert comments" ON "public"."review_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can like public watchlists" ON "public"."watchlist_likes" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ("user_id" <> "owner_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "watchlist_likes"."owner_id") AND ("profiles"."review_visibility" = 'public'::"text"))))));



CREATE POLICY "Authenticated users can report comments" ON "public"."comment_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Authenticated users can update cached movies" ON "public"."movies" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update cached tv episodes" ON "public"."tv_episodes_cache" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update cached tv shows" ON "public"."tv_shows" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "First takes visible with profile privacy" ON "public"."first_takes" FOR SELECT USING ("public"."can_view_user_content"("user_id", "visibility"));



CREATE POLICY "Followers can read followers_only reviews" ON "public"."reviews" FOR SELECT USING ((("visibility" = 'followers_only'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."follows"
  WHERE (("follows"."following_id" = "reviews"."user_id") AND ("follows"."follower_id" = "auth"."uid"()))))));



CREATE POLICY "Follows are publicly readable" ON "public"."follows" FOR SELECT USING (true);



CREATE POLICY "Genres are publicly readable" ON "public"."genres" FOR SELECT USING (true);



CREATE POLICY "Lists visible with profile privacy" ON "public"."user_lists" FOR SELECT USING ("public"."can_view_user_content"("user_id",
CASE
    WHEN "is_public" THEN 'public'::"text"
    ELSE 'private'::"text"
END));



CREATE POLICY "Movies cache is publicly readable" ON "public"."movies" FOR SELECT USING (true);



CREATE POLICY "Profiles are publicly readable" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Reviews visible with profile privacy" ON "public"."reviews" FOR SELECT USING ("public"."can_view_user_content"("user_id", "visibility"));



CREATE POLICY "Service role can read all feature requests" ON "public"."feature_requests" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Service role can update feature requests" ON "public"."feature_requests" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "TV episodes cache is publicly readable" ON "public"."tv_episodes_cache" FOR SELECT USING (true);



CREATE POLICY "TV shows cache is publicly readable" ON "public"."tv_shows" FOR SELECT USING (true);



CREATE POLICY "User achievements are viewable by everyone" ON "public"."user_achievements" FOR SELECT USING (true);



CREATE POLICY "User movies visible with profile privacy" ON "public"."user_movies" FOR SELECT USING ("public"."can_view_user_content"("user_id", 'public'::"text"));



CREATE POLICY "Users can add movies to own lists" ON "public"."list_movies" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_lists"
  WHERE (("user_lists"."id" = "list_movies"."list_id") AND ("user_lists"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can block others" ON "public"."blocked_users" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can create first takes" ON "public"."first_takes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create follow requests" ON "public"."follow_requests" FOR INSERT TO "authenticated" WITH CHECK (("requester_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can create own lists" ON "public"."user_lists" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create reports" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Users can delete own comments" ON "public"."review_comments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own comments" ON "public"."watchlist_comments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own episode watches" ON "public"."user_episode_watches" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own first takes" ON "public"."first_takes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own likes" ON "public"."review_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own lists" ON "public"."user_lists" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own movies" ON "public"."user_movies" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own theater visits" ON "public"."theater_visits" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own tv show likes" ON "public"."user_tv_show_likes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own tv shows" ON "public"."user_tv_shows" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own follow requests" ON "public"."follow_requests" FOR DELETE TO "authenticated" USING ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("target_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can delete their own likes" ON "public"."user_movie_likes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can follow others" ON "public"."follows" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users can insert own episode watches" ON "public"."user_episode_watches" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own likes" ON "public"."review_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own movies" ON "public"."user_movies" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own scan usage" ON "public"."scan_usage" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own theater visits" ON "public"."theater_visits" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own tv show likes" ON "public"."user_tv_show_likes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own tv shows" ON "public"."user_tv_shows" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own likes" ON "public"."user_movie_likes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can only access own ticket scans" ON "public"."ticket_scans" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own ai_usage_costs" ON "public"."ai_usage_costs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own feature requests" ON "public"."feature_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own popcorn" ON "public"."user_popcorn" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own reviews" ON "public"."reviews" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can remove movies from own lists" ON "public"."list_movies" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_lists"
  WHERE (("user_lists"."id" = "list_movies"."list_id") AND ("user_lists"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can see own reports" ON "public"."comment_reports" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Users can unblock" ON "public"."blocked_users" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can unfollow" ON "public"."follows" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users can unlike watchlists" ON "public"."watchlist_likes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update movies in own lists" ON "public"."list_movies" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_lists" "ul"
  WHERE (("ul"."id" = "list_movies"."list_id") AND ("ul"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_lists" "ul"
  WHERE (("ul"."id" = "list_movies"."list_id") AND ("ul"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can update own episode watches" ON "public"."user_episode_watches" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own first takes" ON "public"."first_takes" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own lists" ON "public"."user_lists" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own movies" ON "public"."user_movies" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own scan usage" ON "public"."scan_usage" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own theater visits" ON "public"."theater_visits" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own tv shows" ON "public"."user_tv_shows" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update their own scan usage" ON "public"."scan_usage" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view movies in accessible lists" ON "public"."list_movies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_lists" "ul"
  WHERE (("ul"."id" = "list_movies"."list_id") AND (("ul"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("ul"."is_public" = true))))));



CREATE POLICY "Users can view own episode watches" ON "public"."user_episode_watches" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own movies" ON "public"."user_movies" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own or public lists" ON "public"."user_lists" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("is_public" = true)));



CREATE POLICY "Users can view own rate limits" ON "public"."rate_limits" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own scan usage" ON "public"."scan_usage" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own theater visits" ON "public"."theater_visits" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own tv show likes" ON "public"."user_tv_show_likes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own tv shows" ON "public"."user_tv_shows" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own blocks" ON "public"."blocked_users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can view their own follow requests" ON "public"."follow_requests" FOR SELECT TO "authenticated" USING ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("target_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can view their own likes" ON "public"."user_movie_likes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own reports" ON "public"."reports" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Users can view their own scan usage" ON "public"."scan_usage" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Watchlist comments are publicly readable" ON "public"."watchlist_comments" FOR SELECT USING (true);



CREATE POLICY "Watchlist likes are publicly readable" ON "public"."watchlist_likes" FOR SELECT USING (true);



ALTER TABLE "public"."achievement_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "actor_can_delete_own_follow_request_notif" ON "public"."notifications" FOR DELETE USING ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("type" = 'follow_request'::"text")));



ALTER TABLE "public"."ai_usage_costs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_read_tv_show_episodes" ON "public"."tv_show_episodes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."blocked_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_likes_delete" ON "public"."comment_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "comment_likes_insert" ON "public"."comment_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "comment_likes_select" ON "public"."comment_likes" FOR SELECT USING (true);



ALTER TABLE "public"."comment_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."first_takes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."genres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ip_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."list_movies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_notification_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."release_calendar" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "release_calendar_read_all" ON "public"."release_calendar" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "target_can_accept_follows" ON "public"."follows" FOR INSERT WITH CHECK (("following_id" = "auth"."uid"()));



ALTER TABLE "public"."theater_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_scans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tv_episodes_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tv_show_episodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tv_shows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_can_delete_own_notifications" ON "public"."notifications" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_episode_watches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_movie_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_movies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_popcorn" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_streaming_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tv_show_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tv_shows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_manage_own_prefs" ON "public"."notification_preferences" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_manage_own_tokens" ON "public"."push_tokens" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_own_streaming" ON "public"."user_streaming_services" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_read_own_logs" ON "public"."push_notification_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_read_own_subscriptions" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."watchlist_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."watchlist_likes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."award_popcorn_retroactive"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."award_popcorn_retroactive"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_popcorn_retroactive"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_user_content"("content_user_id" "uuid", "content_visibility" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_user_content"("content_user_id" "uuid", "content_visibility" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_user_content"("content_user_id" "uuid", "content_visibility" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_increment_scan"("p_user_id" "uuid", "p_daily_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_increment_scan"("p_user_id" "uuid", "p_daily_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_increment_scan"("p_user_id" "uuid", "p_daily_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_daily_ai_spend"("p_daily_limit_usd" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."check_daily_ai_spend"("p_daily_limit_usd" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_daily_ai_spend"("p_daily_limit_usd" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_ip_rate_limit"("p_ip_address" "text", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_ip_rate_limit"("p_ip_address" "text", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_ip_rate_limit"("p_ip_address" "text", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_movie_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_movie_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_movie_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_tv_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_tv_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_tv_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_follow_notification"() TO "service_role";



GRANT ALL ON TABLE "public"."user_movies" TO "anon";
GRANT ALL ON TABLE "public"."user_movies" TO "authenticated";
GRANT ALL ON TABLE "public"."user_movies" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_journey_with_next_number"("p_user_id" "uuid", "p_tmdb_id" integer, "p_title" "text", "p_overview" "text", "p_poster_path" "text", "p_backdrop_path" "text", "p_release_date" "text", "p_vote_average" numeric, "p_genre_ids" integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_journey_with_next_number"("p_user_id" "uuid", "p_tmdb_id" integer, "p_title" "text", "p_overview" "text", "p_poster_path" "text", "p_backdrop_path" "text", "p_release_date" "text", "p_vote_average" numeric, "p_genre_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_journey_with_next_number"("p_user_id" "uuid", "p_tmdb_id" integer, "p_title" "text", "p_overview" "text", "p_poster_path" "text", "p_backdrop_path" "text", "p_release_date" "text", "p_vote_average" numeric, "p_genre_ids" integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_journey_for_movie"("p_tmdb_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_journey_for_movie"("p_tmdb_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_journey_for_movie"("p_tmdb_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_journey_with_movie"("p_journey_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_journey_with_movie"("p_journey_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_journey_with_movie"("p_journey_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_movie_journeys"("p_tmdb_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_movie_journeys"("p_tmdb_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_movie_journeys"("p_tmdb_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_pending_release_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_release_reminders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_pending_tv_episode_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_tv_episode_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_season_progress"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_season_progress"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_season_progress"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_suggested_users"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_suggested_users"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_suggested_users"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_monthly_activity"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_monthly_activity"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_monthly_activity"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_stats_summary"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_stats_summary"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_stats_summary"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_bonus_scans"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_bonus_scans"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_bonus_scans"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_followers_on_full_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_followers_on_full_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_followers_on_full_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_followers_on_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_followers_on_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_followers_on_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_list_movies"("p_list_id" "uuid", "p_ordered_tmdb_ids" integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_list_movies"("p_list_id" "uuid", "p_ordered_tmdb_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_list_movies"("p_list_id" "uuid", "p_ordered_tmdb_ids" integer[]) TO "service_role";



GRANT ALL ON TABLE "public"."feature_requests" TO "anon";
GRANT ALL ON TABLE "public"."feature_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_feature_request"("p_type" "text", "p_title" "text", "p_description" "text", "p_screenshot_url" "text", "p_app_version" "text", "p_platform" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_feature_request"("p_type" "text", "p_title" "text", "p_description" "text", "p_screenshot_url" "text", "p_app_version" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_feature_request"("p_type" "text", "p_title" "text", "p_description" "text", "p_screenshot_url" "text", "p_app_version" "text", "p_platform" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_tier"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_tier"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_tier"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_comment_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_comment_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_comment_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_follow_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_follow_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_follow_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."achievement_levels" TO "anon";
GRANT ALL ON TABLE "public"."achievement_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."achievement_levels" TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_costs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_costs" TO "service_role";



GRANT ALL ON TABLE "public"."blocked_users" TO "anon";
GRANT ALL ON TABLE "public"."blocked_users" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_users" TO "service_role";



GRANT ALL ON TABLE "public"."comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_likes" TO "service_role";



GRANT ALL ON TABLE "public"."comment_reports" TO "anon";
GRANT ALL ON TABLE "public"."comment_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_reports" TO "service_role";



GRANT ALL ON TABLE "public"."first_takes" TO "anon";
GRANT ALL ON TABLE "public"."first_takes" TO "authenticated";
GRANT ALL ON TABLE "public"."first_takes" TO "service_role";



GRANT ALL ON TABLE "public"."follow_requests" TO "anon";
GRANT ALL ON TABLE "public"."follow_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_requests" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."genres" TO "anon";
GRANT ALL ON TABLE "public"."genres" TO "authenticated";
GRANT ALL ON TABLE "public"."genres" TO "service_role";



GRANT ALL ON TABLE "public"."ip_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."ip_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."ip_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."list_movies" TO "anon";
GRANT ALL ON TABLE "public"."list_movies" TO "authenticated";
GRANT ALL ON TABLE "public"."list_movies" TO "service_role";



GRANT ALL ON TABLE "public"."movies" TO "anon";
GRANT ALL ON TABLE "public"."movies" TO "authenticated";
GRANT ALL ON TABLE "public"."movies" TO "service_role";



GRANT ALL ON SEQUENCE "public"."movies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."movies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."movies_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_notification_log" TO "anon";
GRANT ALL ON TABLE "public"."push_notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."push_notification_log" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."release_calendar" TO "anon";
GRANT ALL ON TABLE "public"."release_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."release_calendar" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."review_comments" TO "anon";
GRANT ALL ON TABLE "public"."review_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."review_comments" TO "service_role";



GRANT ALL ON TABLE "public"."review_likes" TO "anon";
GRANT ALL ON TABLE "public"."review_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."review_likes" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."scan_usage" TO "anon";
GRANT ALL ON TABLE "public"."scan_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_usage" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."theater_visits" TO "anon";
GRANT ALL ON TABLE "public"."theater_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."theater_visits" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_scans" TO "anon";
GRANT ALL ON TABLE "public"."ticket_scans" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_scans" TO "service_role";



GRANT ALL ON TABLE "public"."tv_episodes_cache" TO "anon";
GRANT ALL ON TABLE "public"."tv_episodes_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."tv_episodes_cache" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tv_episodes_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tv_episodes_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tv_episodes_cache_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tv_show_episodes" TO "anon";
GRANT ALL ON TABLE "public"."tv_show_episodes" TO "authenticated";
GRANT ALL ON TABLE "public"."tv_show_episodes" TO "service_role";



GRANT ALL ON TABLE "public"."tv_shows" TO "anon";
GRANT ALL ON TABLE "public"."tv_shows" TO "authenticated";
GRANT ALL ON TABLE "public"."tv_shows" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tv_shows_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tv_shows_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tv_shows_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_episode_watches" TO "anon";
GRANT ALL ON TABLE "public"."user_episode_watches" TO "authenticated";
GRANT ALL ON TABLE "public"."user_episode_watches" TO "service_role";



GRANT ALL ON TABLE "public"."user_lists" TO "anon";
GRANT ALL ON TABLE "public"."user_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."user_lists" TO "service_role";



GRANT ALL ON TABLE "public"."user_movie_likes" TO "anon";
GRANT ALL ON TABLE "public"."user_movie_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_movie_likes" TO "service_role";



GRANT ALL ON TABLE "public"."user_popcorn" TO "anon";
GRANT ALL ON TABLE "public"."user_popcorn" TO "authenticated";
GRANT ALL ON TABLE "public"."user_popcorn" TO "service_role";



GRANT ALL ON TABLE "public"."user_streaming_services" TO "anon";
GRANT ALL ON TABLE "public"."user_streaming_services" TO "authenticated";
GRANT ALL ON TABLE "public"."user_streaming_services" TO "service_role";



GRANT ALL ON TABLE "public"."user_tv_show_likes" TO "anon";
GRANT ALL ON TABLE "public"."user_tv_show_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tv_show_likes" TO "service_role";



GRANT ALL ON TABLE "public"."user_tv_shows" TO "anon";
GRANT ALL ON TABLE "public"."user_tv_shows" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tv_shows" TO "service_role";



GRANT ALL ON TABLE "public"."watchlist_comments" TO "anon";
GRANT ALL ON TABLE "public"."watchlist_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist_comments" TO "service_role";



GRANT ALL ON TABLE "public"."watchlist_likes" TO "anon";
GRANT ALL ON TABLE "public"."watchlist_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist_likes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop policy "release_calendar_read_all" on "public"."release_calendar";


  create policy "release_calendar_read_all"
  on "public"."release_calendar"
  as permissive
  for select
  to anon, authenticated
using (true);


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Allow journey art uploads"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'journey-art'::text) AND ((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))));



  create policy "Journey photos are publicly readable"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'journey-photos'::text));



  create policy "Public read access for journey art"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'journey-art'::text));



  create policy "Service role can read all feedback screenshots"
  on "storage"."objects"
  as permissive
  for select
  to service_role
using ((bucket_id = 'feedback-screenshots'::text));



  create policy "Ticket photos are publicly readable"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'ticket-photos'::text));



  create policy "Users can delete own avatar 1oj01fe_0"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));



  create policy "Users can delete own avatar 1oj01fe_1"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));



  create policy "Users can delete own journey photos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'journey-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can delete their own feedback screenshots"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'feedback-screenshots'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can delete their own journey art"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'journey-art'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can read their own feedback screenshots"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'feedback-screenshots'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update own avatar 1oj01fe_0"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));



  create policy "Users can update own avatar 1oj01fe_1"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));



  create policy "Users can update their own journey art"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'journey-art'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can update their own ticket photos"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'ticket-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload own avatar 1oj01fe_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));



  create policy "Users can upload own journey photos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'journey-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload their own feedback screenshots"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'feedback-screenshots'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload their own ticket photos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'ticket-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));





