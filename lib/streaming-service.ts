import { supabase } from './supabase';

/** A streaming provider from TMDB */
export interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

/** Fetch available streaming providers for a region from our edge function */
export async function getStreamingProviders(region: string = 'US'): Promise<StreamingProvider[]> {
  const { data, error } = await supabase.functions.invoke<{ providers: StreamingProvider[] }>(
    'get-streaming-providers',
    { body: { region } }
  );
  if (error) throw new Error(error.message || 'Failed to fetch streaming providers');
  return data?.providers ?? [];
}

/** Get user's selected streaming services */
export async function getUserStreamingServices(userId: string): Promise<StreamingProvider[]> {
  const { data, error } = await supabase
    .from('user_streaming_services')
    .select('provider_id, provider_name, provider_logo_path')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({
    provider_id: row.provider_id,
    provider_name: row.provider_name,
    logo_path: row.provider_logo_path ?? '',
  }));
}

/** Add a streaming service to user's subscriptions */
export async function addStreamingService(
  userId: string,
  provider: StreamingProvider
): Promise<void> {
  const { error } = await supabase
    .from('user_streaming_services')
    .upsert({
      user_id: userId,
      provider_id: provider.provider_id,
      provider_name: provider.provider_name,
      provider_logo_path: provider.logo_path,
    }, { onConflict: 'user_id,provider_id' });

  if (error) throw new Error(error.message);
}

/** Remove a streaming service from user's subscriptions */
export async function removeStreamingService(
  userId: string,
  providerId: number
): Promise<void> {
  const { error } = await supabase
    .from('user_streaming_services')
    .delete()
    .eq('user_id', userId)
    .eq('provider_id', providerId);

  if (error) throw new Error(error.message);
}
