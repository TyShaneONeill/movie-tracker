import React, { useEffect, useRef, useMemo, useState, useId } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, FontSizes } from '@/constants/theme';

interface NativeFeedAdProps {
  index: number;
}

export function NativeFeedAd({ index }: NativeFeedAdProps) {
  const { adsReady } = useAds();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [loaded, setLoaded] = useState(false);
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const instanceId = useId();

  const themedStyles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!adsReady || pushed.current) return;

    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushed.current = true;
      console.log('[AdSense] Feed ad pushed');
      // Mark as loaded after a short delay (AdSense fills asynchronously)
      setTimeout(() => setLoaded(true), 500);
    } catch (e) {
      console.warn('[AdSense] Feed ad push failed:', e);
    }
  }, [adsReady]);

  if (!adsReady) return null;

  return (
    <View style={themedStyles.container}>
      <View style={themedStyles.labelRow}>
        <Text style={themedStyles.sponsoredLabel}>Sponsored</Text>
      </View>
      <div
        style={{
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease-in',
          minHeight: 250,
        }}
      >
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{
            display: 'block',
            width: '100%',
            minHeight: 250,
          }}
          data-ad-client="ca-pub-5311715630678079"
          data-ad-format="rectangle"
          key={instanceId}
        />
      </div>
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
  });
