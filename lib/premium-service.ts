import { supabase } from '@/lib/supabase';
import type { PremiumTier } from '@/lib/premium-features';

export interface SubscriptionStatus {
  tier: PremiumTier;
  tierExpiresAt: string | null;
}

/**
 * Fetch the current subscription status from the profiles table.
 * This is the immediate source of truth from the DB — no RevenueCat SDK involved.
 */
export async function fetchSubscriptionStatus(
  userId: string
): Promise<SubscriptionStatus> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_tier, tier_expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch subscription status: ${error.message}`);
  }

  if (!data) {
    return { tier: 'free', tierExpiresAt: null };
  }

  const profileData = data as { account_tier: string; tier_expires_at: string | null };
  const rawTier = profileData.account_tier || 'free';

  // Map DB values to PremiumTier
  let tier: PremiumTier = 'free';
  if (rawTier === 'dev') {
    tier = 'dev';
  } else if (rawTier === 'plus' || rawTier === 'premium') {
    // Support both 'plus' (new) and 'premium' (legacy) during migration
    tier = 'plus';
  }

  return {
    tier,
    tierExpiresAt: profileData.tier_expires_at,
  };
}
