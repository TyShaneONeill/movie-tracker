import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Animated, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { captureMessage } from '@/lib/sentry';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius, FontSizes } from '@/constants/theme';

// react-native-google-mobile-ads is NOT imported at module level — doing so executes
// module-level initialization code that crashes on iOS 26.4 beta. Loaded lazily on first render.
// Web uses native-feed-ad.web.tsx instead (no native ads on web).

// "Banner - Feed" AdMob units (Banner format). The old units (…6912336439 iOS /
// …5077578184 Android) were "Native advanced" format and could not serve this
// component's BannerAd request, so the Feed ad hung on a perpetual spinner.
const NATIVE_FEED_AD_UNIT_ID = Platform.select({
  ios: 'ca-app-pub-5311715630678079/6627383448',
  android: 'ca-app-pub-5311715630678079/7940465110',
  default: 'ca-app-pub-5311715630678079/6627383448',
})!;

export function NativeFeedAd() {
  const { adsReady } = useAds();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors), [colors]);

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

  useEffect(() => {
    if (loaded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [loaded, fadeAnim]);

  // Safety net: if neither onAdLoaded nor onAdFailedToLoad fires within the
  // timeout (a stuck/hanging request — e.g. a unit that isn't serving yet),
  // hide the slot instead of leaving a perpetual empty 250px loading box.
  useEffect(() => {
    if (loaded || failed) return;
    const t = setTimeout(() => setFailed(true), 6000);
    return () => clearTimeout(t);
  }, [loaded, failed]);

  if (!adsReady || !adComponents || failed) return null;

  const { BannerAd, BannerAdSize, TestIds } = adComponents;
  const unitId = __DEV__
    ? TestIds.ADAPTIVE_BANNER
    : NATIVE_FEED_AD_UNIT_ID;

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
          unitId={unitId}
          size={BannerAdSize.MEDIUM_RECTANGLE}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => {
            setLoaded(true);
          }}
          onAdFailedToLoad={(error: Error) => {
            console.warn('[AdMob] Feed ad failed:', error.message);
            captureMessage('AdMob feed ad failed', {
              error: error.message,
            });
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
