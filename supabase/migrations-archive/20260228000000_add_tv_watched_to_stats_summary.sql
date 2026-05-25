-- Drop existing function first (return type is changing)
DROP FUNCTION IF EXISTS public.get_user_stats_summary(uuid);

-- Recreate with total_tv_watched column
CREATE FUNCTION public.get_user_stats_summary(p_user_id uuid)
RETURNS TABLE(total_watched bigint, total_first_takes bigint, avg_rating numeric, total_tv_watched bigint)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.user_movies WHERE user_id = p_user_id AND status = 'watched') as total_watched,
    (SELECT COUNT(*) FROM public.first_takes WHERE user_id = p_user_id AND TRIM(quote_text) != '') as total_first_takes,
    (SELECT AVG(ft.rating) FROM public.first_takes ft WHERE ft.user_id = p_user_id AND ft.rating IS NOT NULL AND TRIM(ft.quote_text) != '') as avg_rating,
    (SELECT COUNT(*) FROM public.user_tv_shows WHERE user_id = p_user_id AND status = 'watched') as total_tv_watched;
END;
$$;
