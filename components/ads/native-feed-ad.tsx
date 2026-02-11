import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius, FontSizes } from '@/constants/theme';

// Guarded require for Expo Go compatibility
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

export function NativeFeedAd() {
  const { adsEnabled } = useAds();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (loaded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [loaded, fadeAnim]);

  if (!adsEnabled || !AdComponents || failed) return null;

  const { BannerAd, BannerAdSize, TestIds } = AdComponents;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.sponsoredLabel}>Sponsored</Text>
      </View>
      {!loaded && (
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      )}
      <Animated.View style={{ opacity: fadeAnim }}>
        <BannerAd
          unitId={TestIds.ADAPTIVE_BANNER}
          size={BannerAdSize.MEDIUM_RECTANGLE}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => setLoaded(true)}
          onAdFailedToLoad={(error: Error) => {
            console.log('Feed ad failed to load:', error);
            setFailed(true);
          }}
        />
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: Spacing.xs,
    },
    sponsoredLabel: {
      fontSize: FontSizes.xs,
      color: colors.textTertiary,
      fontWeight: '500',
    },
    placeholder: {
      height: 250,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: BorderRadius.sm,
    },
  });
