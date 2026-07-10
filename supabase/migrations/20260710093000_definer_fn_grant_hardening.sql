-- July 2026 SECURITY DEFINER audit hardening.
--
-- Root cause: 20260703093000_lock_down_anon_definer_rpcs.sql revoked EXECUTE
-- from anon/authenticated but NOT from PUBLIC. Postgres auto-grants EXECUTE to
-- PUBLIC on function creation, and anon/authenticated inherit PUBLIC, so the
-- "lockdown" was a behavioral no-op — the fns stayed anon-executable. Same
-- class as the day2/recap cron exposure (20260707170000) and documented in
-- 20260605062443. Fix: every revoke targets PUBLIC, anon, authenticated.
--
-- Verified before writing this migration:
--   * No client code calls any REVOKE-BOTH fn directly via .rpc() — grep of
--     app/ hooks/ lib/ components/ is clean. Their only callers are edge
--     functions using a service_role client (get-user-stats, get-suggested-users,
--     scan-ticket, grant-ad-reward, generate-taste-summary, _shared/rate-limit).
--   * REVOKE-ANON fns ARE client-JWT calls (journeys, season/tv progress,
--     popcorn) — they keep `authenticated`.
--   * follows privacy (public/private/mutual visibility) is enforced by the
--     `follows` RLS policy + can_view_user_content(), NEITHER touched here.
--     can_view_user_content stays anon-executable (RLS helper).

-- ── REVOKE-BOTH: server/cron only; only edge fns via service_role call these ──
REVOKE ALL ON FUNCTION "public"."get_user_monthly_activity"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_monthly_activity"("uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_user_stats_summary"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_stats_summary"("uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_suggested_users"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_suggested_users"("uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."check_and_increment_scan"("uuid", integer) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_and_increment_scan"("uuid", integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."check_rate_limit"("uuid", "text", integer, integer) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_rate_limit"("uuid", "text", integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."check_ip_rate_limit"("text", "text", integer, integer) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_ip_rate_limit"("text", "text", integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."check_daily_ai_spend"(numeric) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_daily_ai_spend"(numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_stale_tv_cache"() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cleanup_stale_tv_cache"() TO "service_role";

-- ── REVOKE-ANON: client-JWT calls; keep authenticated (owner's own data) ──
REVOKE ALL ON FUNCTION "public"."sync_tv_show_progress"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_tv_show_progress"("uuid") TO "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_season_progress"("uuid", integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_season_progress"("uuid", integer) TO "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_journey_for_movie"(integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_journey_for_movie"(integer) TO "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_journey_with_movie"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_journey_with_movie"("uuid") TO "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_movie_journeys"(integer) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_movie_journeys"(integer) TO "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."award_popcorn_retroactive"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."award_popcorn_retroactive"("uuid") TO "authenticated", "service_role";

-- can_view_user_content stays anon-executable (RLS privacy helper) — intentionally
-- NOT revoked. Trigger fns are unreachable via /rpc — omitted.
