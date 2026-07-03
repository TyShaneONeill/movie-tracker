-- July 2026 security audit — RLS lane. Anon-callable SECURITY DEFINER RPCs that
-- take a caller-supplied p_user_id, run as postgres (bypassing RLS), and are
-- GRANT EXECUTE to anon → unauthenticated IDOR against any user's private data.
-- Verified live on prod: none of the three has an auth.uid() reference or guard.
--
-- FIX STRATEGY DIFFERS BY CALLER (verified against source, not assumed):
--   * get_suggested_users + check_and_increment_scan are invoked ONLY by edge
--     functions using the service-role client (scan-ticket, suggested-users).
--     auth.uid() is NULL there, so a body guard would BREAK them. Instead we
--     revoke EXECUTE from anon + authenticated; service_role keeps its grant.
--   * award_popcorn_retroactive is client-called with a user JWT
--     (lib/popcorn-service.ts) — bind it to auth.uid() (ignore p_user_id),
--     pin search_path, revoke anon, mirroring the increment_bonus_scans fix
--     (20260605062224).

-- ── 1. get_suggested_users (SQL, edge-fn/service-role only) ──────────────────
REVOKE EXECUTE ON FUNCTION "public"."get_suggested_users"("uuid") FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."get_suggested_users"("uuid") FROM "authenticated";

-- ── 2. check_and_increment_scan (plpgsql, scan-ticket edge-fn/service-role) ──
REVOKE EXECUTE ON FUNCTION "public"."check_and_increment_scan"("uuid", integer) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."check_and_increment_scan"("uuid", integer) FROM "authenticated";

-- ── 3. award_popcorn_retroactive (plpgsql, CLIENT via user JWT) ──────────────
-- Bind to the authenticated caller; p_user_id kept in the signature so the
-- existing client call keeps working but is ignored for all reads/writes.
CREATE OR REPLACE FUNCTION "public"."award_popcorn_retroactive"("p_user_id" "uuid")
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();   -- bind to the caller; ignore p_user_id
  v_first_take_count INTEGER;
  v_comment_count INTEGER;
  v_like_count INTEGER;
  v_owed INTEGER;
  v_earned INTEGER;
  i INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Follows
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT v_user_id, 'follow', following_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, created_at
  FROM follows WHERE follower_id = v_user_id
  ON CONFLICT DO NOTHING;

  -- Movies watched
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT v_user_id, 'mark_watched', 'movie:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(watched_at, added_at, now())
  FROM user_movies WHERE user_id = v_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- TV shows watched
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT v_user_id, 'mark_watched', 'tv:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(updated_at, added_at, now())
  FROM user_tv_shows WHERE user_id = v_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- first_take: 1 kernel per 10
  SELECT COUNT(*) INTO v_first_take_count FROM first_takes WHERE user_id = v_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = v_user_id AND action_type = 'first_take';
  v_owed := FLOOR(v_first_take_count / 10) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (v_user_id, 'first_take', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  -- comment: 1 kernel per 10
  SELECT COUNT(*) INTO v_comment_count FROM review_comments WHERE user_id = v_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = v_user_id AND action_type = 'comment';
  v_owed := FLOOR(v_comment_count / 10) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (v_user_id, 'comment', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  -- like: 1 kernel per 50
  SELECT COUNT(*) INTO v_like_count FROM review_likes WHERE user_id = v_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = v_user_id AND action_type = 'like';
  v_owed := FLOOR(v_like_count / 50) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (v_user_id, 'like', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  RETURN 0;
END;
$function$;

REVOKE EXECUTE ON FUNCTION "public"."award_popcorn_retroactive"("uuid") FROM "anon";

-- ── 4. user_achievements SELECT USING(true) → privacy-aware (P2) ─────────────
-- Same class as the follows leak (20260702190000): a private profile's
-- achievements leaked watch history via achievement names to anyone.
-- can_view_user_content() returns true for owner/public/accepted-follower,
-- so legitimate reads (incl. own achievements) are unaffected.
ALTER POLICY "User achievements are viewable by everyone"
  ON "public"."user_achievements"
  USING ("public"."can_view_user_content"("user_id", 'public'::"text"));
