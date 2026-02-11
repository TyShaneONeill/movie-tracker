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

export function BannerAdComponent() {
  const { adsEnabled } = useAds();

  if (!adsEnabled || !AdComponents) return null;

  const { BannerAd, BannerAdSize, TestIds } = AdComponents;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={TestIds.ADAPTIVE_BANNER}
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
