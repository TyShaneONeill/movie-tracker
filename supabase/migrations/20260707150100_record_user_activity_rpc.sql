-- PS-15 PR 3 — punch-card streak spine, part 2/3: record_user_activity().
--
-- Client-called (user JWT) on every qualifying action. Bound to auth.uid() —
-- there is no p_user_id parameter, so it can only ever touch the caller's own
-- streak (matches the award_popcorn_retroactive fix in
-- 20260703093000_lock_down_anon_definer_rpcs.sql). SECURITY DEFINER so it can
-- write the RPC-only tables whose RLS denies direct client writes.
--
-- Day-boundary math is server-side, from profiles.timezone (PS-15 PR 0) — never
-- CURRENT_DATE-as-user-day. A NULL or non-IANA timezone falls back to UTC, with
-- the same pg_catalog.pg_timezone_names validity guard used by the day2/recap
-- candidate RPCs (a malformed tz string must not raise inside AT TIME ZONE).
--
-- STREAK SEMANTICS (locked in the ADR, 2026-07-06):
--   * gap = local_today - last_activity_date (>= 1 once we're past same-day).
--   * missed = gap - 1 fully-skipped days.
--   * covered = min(missed, banked rain_checks); those rain checks are consumed
--     (rain_checks_used incremented) to bridge the gap.
--   * if covered >= missed the streak advances (+1); otherwise it resets to 1.
--     A consecutive day is just the missed=0 case → always advances.
--   * longest_streak is monotonic.
-- Idempotent per (user, local_date): a second+ call the same local day only
-- bumps action_count and possibly earns the day's rain check — it never
-- re-advances the streak (last_activity_date == today short-circuits).
--
-- RAIN-CHECK EARNS: core creation actions only (rate / log / first take /
-- review / scan) earn 1 rain check per earn-DAY, hard-capped at 2 banked. The
-- last_earn_date guard makes the earn fire at most once per local day even
-- across many earn-actions, and independent of whether the streak advanced.
CREATE OR REPLACE FUNCTION "public"."record_user_activity"("p_action" "text")
    RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tz text;
  v_today date;
  v_row public.user_streaks%ROWTYPE;
  v_found boolean;
  v_current integer;
  v_longest integer;
  v_rain integer;
  v_used integer;
  v_last_earn date;
  v_gap integer;
  v_missed integer;
  v_covered integer := 0;
  v_advanced boolean := false;
  v_milestone integer := NULL;
  v_earned boolean := false;
  v_first_action text;
  -- Core creation actions that earn a rain check (not likes/comments/watchlist).
  v_earn_actions text[] := ARRAY['rate', 'log', 'first_take', 'review', 'scan'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'p_action is required';
  END IF;

  -- Resolve the caller's local calendar day.
  SELECT p.timezone INTO v_tz FROM public.profiles p WHERE p.id = v_user_id;
  IF v_tz IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = v_tz
  ) THEN
    v_tz := 'UTC';
  END IF;
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- Record today's activity day. first_action is set once (on insert) and kept
  -- for the diary framing; repeat calls the same day only bump action_count.
  INSERT INTO public.user_activity_days (user_id, local_date, first_action, action_count)
  VALUES (v_user_id, v_today, p_action, 1)
  ON CONFLICT (user_id, local_date)
  DO UPDATE SET action_count = public.user_activity_days.action_count + 1;

  -- Lock the streak row for a consistent read-modify-write.
  SELECT * INTO v_row FROM public.user_streaks WHERE user_id = v_user_id FOR UPDATE;
  v_found := FOUND;

  IF NOT v_found THEN
    v_current := 1;
    v_longest := 1;
    v_rain := 0;
    v_used := 0;
    v_last_earn := NULL;
    v_advanced := true;
  ELSE
    v_current := v_row.current_streak;
    v_longest := v_row.longest_streak;
    v_rain := v_row.rain_checks;
    v_used := v_row.rain_checks_used;
    v_last_earn := v_row.last_earn_date;

    IF v_row.last_activity_date IS NULL THEN
      v_current := 1;
      v_advanced := true;
    ELSIF v_row.last_activity_date = v_today THEN
      -- Already active today — idempotent, no streak change. Earn logic below
      -- may still fire if this is the day's first earn-action.
      v_advanced := false;
    ELSIF v_row.last_activity_date > v_today THEN
      -- Clock/timezone moved backward (e.g. user flew west); don't rewind the
      -- streak, just keep it and treat today as already counted.
      v_advanced := false;
    ELSE
      v_gap := v_today - v_row.last_activity_date;      -- >= 1
      v_missed := v_gap - 1;                            -- fully-skipped days
      v_covered := LEAST(v_missed, v_rain);
      v_rain := v_rain - v_covered;
      v_used := v_used + v_covered;
      IF v_covered >= v_missed THEN
        v_current := v_current + 1;                     -- bridged (or consecutive)
      ELSE
        v_current := 1;                                 -- uncovered gap → reset
      END IF;
      v_advanced := true;
    END IF;
  END IF;

  -- Rain-check earn: once per local day, core creation actions only, cap 2.
  IF p_action = ANY (v_earn_actions)
     AND (v_last_earn IS NULL OR v_last_earn < v_today)
     AND v_rain < 2 THEN
    v_rain := v_rain + 1;
    v_last_earn := v_today;
    v_earned := true;
  END IF;

  v_longest := GREATEST(v_longest, v_current);

  -- Milestone celebration only on the call that ADVANCES the streak onto the
  -- threshold — never on same-day repeats.
  IF v_advanced AND v_current IN (3, 7, 30, 100) THEN
    v_milestone := v_current;
  END IF;

  INSERT INTO public.user_streaks (
    user_id, current_streak, longest_streak, last_activity_date,
    rain_checks, rain_checks_used, last_earn_date, updated_at
  )
  VALUES (
    v_user_id, v_current, v_longest, v_today,
    v_rain, v_used, v_last_earn, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = EXCLUDED.current_streak,
    longest_streak = EXCLUDED.longest_streak,
    last_activity_date = EXCLUDED.last_activity_date,
    rain_checks = EXCLUDED.rain_checks,
    rain_checks_used = EXCLUDED.rain_checks_used,
    last_earn_date = EXCLUDED.last_earn_date,
    updated_at = EXCLUDED.updated_at;

  SELECT first_action INTO v_first_action
  FROM public.user_activity_days
  WHERE user_id = v_user_id AND local_date = v_today;

  RETURN jsonb_build_object(
    'current_streak', v_current,
    'longest_streak', v_longest,
    'rain_checks', v_rain,
    'rain_checks_used', v_used,
    'last_activity_date', v_today,
    'local_date', v_today,
    'first_action', v_first_action,
    'milestone', v_milestone,
    'rain_check_consumed', (v_covered > 0),
    'rain_check_earned', v_earned
  );
END;
$$;

ALTER FUNCTION "public"."record_user_activity"("p_action" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."record_user_activity"("p_action" "text") IS 'Records a qualifying action for auth.uid() on their local calendar day (profiles.timezone), advances/resets the streak (consuming banked rain checks for gaps), earns rain checks for core creation actions (cap 2), and returns the new streak state as jsonb. Idempotent per local day. PS-15 PR 3.';

REVOKE ALL ON FUNCTION "public"."record_user_activity"("p_action" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."record_user_activity"("p_action" "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."record_user_activity"("p_action" "text") TO "authenticated";
