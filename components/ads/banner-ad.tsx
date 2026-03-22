import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { captureMessage } from '@/lib/sentry';
import { Spacing } from '@/constants/theme';

// react-native-google-mobile-ads is NOT imported at module level — doing so executes
// module-level initialization code that crashes on iOS 26.4 beta. Loaded lazily on first render.
// Web uses banner-ad.web.tsx instead (no native ads on web).

type BannerPlacement = 'home' | 'search' | 'stats';

const BANNER_AD_UNIT_IDS: Record<BannerPlacement, string> = {
  home: 'ca-app-pub-5311715630678079/5872641021',
  search: 'ca-app-pub-5311715630678079/2765028314',
  stats: 'ca-app-pub-5311715630678079/7182785474',
};

interface BannerAdProps {
  placement: BannerPlacement;
}

export function BannerAdComponent({ placement }: BannerAdProps) {
  const { adsReady } = useAds();

  // Lazy-load GMA components on first render to avoid module-level native initialization
  // crashing on iOS 26.4 beta via ObjCTurboModule::performVoidMethodInvocation.
  const adComponents = useMemo(() => {
    try {
      const ads = require('react-native-google-mobile-ads');
      return { BannerAd: ads.BannerAd, BannerAdSize: ads.BannerAdSize, TestIds: ads.TestIds };
    } catch {
      return null; // Native module not available (e.g., Expo Go)
    }
  }, []);

  if (!adsReady || !adComponents) return null;

  const { BannerAd, BannerAdSize, TestIds } = adComponents;
  const unitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : BANNER_AD_UNIT_IDS[placement];

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {}}
        onAdFailedToLoad={(error: Error) => {
          console.warn(`[AdMob] Banner failed (${placement}):`, error.message);
          captureMessage(`AdMob banner failed: ${placement}`, {
            placement,
            error: error.message,
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
});
