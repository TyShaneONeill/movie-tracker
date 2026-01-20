import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as FirstTake[];
    },
    enabled: !!user?.id,
  });
}
