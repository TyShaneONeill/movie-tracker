-- Fix: the "Your Year" bar chart undercounted vs. the month drill-in list.
--
-- The chart RPC bucketed movies by `added_at` (when a title entered the
-- library), while the drill-in list (lib/analytics-detail-service.ts) filtered
-- by `watched_at`. For anyone who adds a title one month and watches it another
-- — or backfills historical watch dates — the two disagreed (a month could
-- show "5" on the chart but 0–2 in the list).
--
-- "Your Year" is about what you WATCHED, so both now bucket by the effective
-- watch date: COALESCE(watched_at, added_at) — the added date is only a
-- fallback for rows with no recorded watch date, so nothing silently vanishes.
-- Movies only (TV gets its own by-month graph later).

CREATE OR REPLACE FUNCTION public.get_user_monthly_activity(p_user_id uuid)
 RETURNS TABLE(month text, month_label text, count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      TO_CHAR(COALESCE(watched_at, added_at), 'YYYY-MM') as month,
      COUNT(*) as count
    FROM user_movies
    WHERE user_id = p_user_id
      AND status = 'watched'
      AND COALESCE(watched_at, added_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
    GROUP BY TO_CHAR(COALESCE(watched_at, added_at), 'YYYY-MM')
  )
  SELECT
    m.month,
    m.month_label,
    COALESCE(a.count, 0) as count
  FROM months m
  LEFT JOIN activity a ON m.month = a.month
  ORDER BY m.month_date;
$function$;
