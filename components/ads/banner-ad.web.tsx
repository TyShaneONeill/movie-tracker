import React, { useEffect, useRef, useId } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { Spacing } from '@/constants/theme';

type BannerPlacement = 'home' | 'search' | 'stats';

interface BannerAdProps {
  placement: BannerPlacement;
}

export function BannerAdComponent({ placement }: BannerAdProps) {
  const { adsReady } = useAds();
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const instanceId = useId();

  useEffect(() => {
    if (!adsReady || pushed.current) return;

    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushed.current = true;
      console.log(`[AdSense] Banner pushed (${placement})`);
    } catch (e) {
      console.warn(`[AdSense] Banner push failed (${placement}):`, e);
    }
  }, [adsReady, placement]);

  if (!adsReady) return null;

  return (
    <View style={styles.container}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
        }}
        data-ad-client="ca-pub-5311715630678079"
        data-ad-format="auto"
        data-full-width-responsive="true"
        key={instanceId}
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
