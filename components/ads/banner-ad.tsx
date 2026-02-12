import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { Spacing } from '@/constants/theme';

// Use require() in try-catch to gracefully handle Expo Go
// where the native module isn't available
let AdComponents: {
  BannerAd: any;
  BannerAdSize: any;
  TestIds: any;
} | null = null;

try {
  const ads = require('react-native-google-mobile-ads');
  AdComponents = {
    BannerAd: ads.BannerAd,
    BannerAdSize: ads.BannerAdSize,
    TestIds: ads.TestIds,
  };
} catch {
  // Native module not available (e.g., Expo Go)
}

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
  const { adsEnabled } = useAds();

  if (!adsEnabled || !AdComponents) return null;

  const { BannerAd, BannerAdSize, TestIds } = AdComponents;
  const unitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : BANNER_AD_UNIT_IDS[placement];

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdFailedToLoad={(error: Error) => {
          console.log('Ad failed to load:', error);
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
