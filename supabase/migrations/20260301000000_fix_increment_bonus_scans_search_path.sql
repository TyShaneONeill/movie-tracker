-- H5: Fix mutable search_path on increment_bonus_scans
-- A mutable search_path allows SQL injection via schema manipulation.
-- Setting it explicitly prevents an attacker from prepending a malicious schema.
ALTER FUNCTION public.increment_bonus_scans(uuid) SET search_path = 'public';
