import { supabase } from './supabase';
import type { PersonDetailResponse } from './tmdb.types';

/**
 * Fetch person details from TMDB via Edge Function
 */
export async function getPersonDetails(
  personId: number
): Promise<PersonDetailResponse> {
  const { data, error } = await supabase.functions.invoke<PersonDetailResponse>(
    'get-person-details',
    {
      body: { personId },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch person details');
  }

  if (!data) {
    throw new Error('No data returned from person details');
  }

  return data;
}
