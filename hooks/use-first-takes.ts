import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { filterPubliclyVisibleTakes } from '@/lib/first-take-visibility';
import type { FirstTake } from '@/lib/database.types';

export function useFirstTakes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['first-takes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('first_takes')
        .select('*')
        .eq('user_id', user!.id)
        .like('quote_text', '_%')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // The `.like` above drops `''` but not `'   '` (`_` matches a space) —
      // the helper is the actual wordless-take gate. Applies to the owner's own
      // tab too: the takes list is a posting surface, and the rating still
      // reaches the owner through stats and the composer's existing-take state.
      return filterPubliclyVisibleTakes((data ?? []) as FirstTake[]);
    },
    enabled: !!user?.id,
  });
}
