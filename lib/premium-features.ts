export type PremiumFeatureKey =
  | 'ad_removal'
  | 'unlimited_scans'
  | 'calendar_genre_filter'
  | 'calendar_platform_filter'
  | 'calendar_personalized_toggle'
  | 'release_reminders'
  | 'advanced_stats'
  | 'ai_poster_generation';

export type PremiumTier = 'free' | 'plus' | 'dev';

interface PremiumFeatureConfig {
  label: string;
  description: string;
  icon: string; // Ionicons name
  requiredTier: 'plus'; // v1: always 'plus'
  category: 'core' | 'calendar' | 'stats';
}

export const PREMIUM_FEATURES: Record<PremiumFeatureKey, PremiumFeatureConfig> = {
  ad_removal: {
    label: 'Ad-Free Experience',
    description: 'Browse without interruptions — no banners, no interstitials',
    icon: 'eye-off-outline',
    requiredTier: 'plus',
    category: 'core',
  },
  unlimited_scans: {
    label: 'Unlimited Ticket Scans',
    description: 'Scan up to 20 tickets per day instead of 3',
    icon: 'scan-outline',
    requiredTier: 'plus',
    category: 'core',
  },
  release_reminders: {
    label: 'Release Reminders',
    description: 'Get push notifications when movies you care about are released',
    icon: 'notifications-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  calendar_genre_filter: {
    label: 'Genre Filter',
    description: 'Filter the release calendar by genre to see only what you love',
    icon: 'film-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  calendar_platform_filter: {
    label: 'My Platforms Only',
    description: 'Show only releases on your streaming services',
    icon: 'tv-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  calendar_personalized_toggle: {
    label: 'Personalized Only',
    description: "Hide releases that don't match your taste profile",
    icon: 'sparkles-outline',
    requiredTier: 'plus',
    category: 'calendar',
  },
  advanced_stats: {
    label: 'Advanced Stats',
    description: 'Year in review, genre breakdown, total time watched, and more',
    icon: 'bar-chart-outline',
    requiredTier: 'plus',
    category: 'stats',
  },
  ai_poster_generation: {
    label: 'AI Poster Art',
    description: 'Generate unlimited AI cartoon posters for your journeys',
    icon: 'sparkles-outline',
    requiredTier: 'plus',
    category: 'core',
  },
};

/** Check if a feature is available for a given tier */
export function isFeatureAvailable(
  featureKey: PremiumFeatureKey,
  tier: PremiumTier
): boolean {
  if (tier === 'dev') return true;
  if (tier === 'free') return false;
  // v1: 'plus' unlocks everything
  const feature = PREMIUM_FEATURES[featureKey];
  return tier === feature.requiredTier;
}
