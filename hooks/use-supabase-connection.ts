import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface ConnectionStatus {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useSupabaseConnection(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.from('profiles').select('id').limit(0);

        if (error) {
          throw error;
        }

        setStatus({
          isConnected: true,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setStatus({
          isConnected: false,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Unknown connection error',
        });
      }
    }

    checkConnection();
  }, []);

  return status;
}
