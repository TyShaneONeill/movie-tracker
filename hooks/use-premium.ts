import { usePremium } from '@/lib/premium-context';
import { isFeatureAvailable } from '@/lib/premium-features';
import type { PremiumFeatureKey } from '@/lib/premium-features';

export { usePremium };

/**
 * Convenience hook that checks if a specific premium feature is unlocked.
 * Combines usePremium() with isFeatureAvailable() for a single-call gate.
 *
 * @example
 * const { isUnlocked, isPremium, tier } = usePremiumGate('advanced_stats');
 * if (!isUnlocked) showUpgradePrompt();
 */
export function usePremiumGate(featureKey: PremiumFeatureKey) {
  const { tier, isPremium, isLoading } = usePremium();

  return {
    /** Whether this specific feature is unlocked */
    isUnlocked: isFeatureAvailable(featureKey, tier),
    /** Whether the user has any premium tier */
    isPremium,
    /** Current tier */
    tier,
    /** Whether premium status is still loading */
    isLoading,
  };
}
