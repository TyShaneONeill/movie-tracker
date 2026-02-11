import { useCallback, useEffect, useRef, useState } from 'react';
import { useAds } from '@/lib/ads-context';

// Guarded require for Expo Go compatibility
let AdModule: {
  RewardedAd: any;
  RewardedAdEventType: any;
  TestIds: any;
} | null = null;

try {
  const ads = require('react-native-google-mobile-ads');
  AdModule = {
    RewardedAd: ads.RewardedAd,
    RewardedAdEventType: ads.RewardedAdEventType,
    TestIds: ads.TestIds,
  };
} catch {
  // Native module not available (e.g., Expo Go)
}

export function useRewardedAd() {
  const { adsEnabled } = useAds();
  const [loaded, setLoaded] = useState(false);
  const adRef = useRef<any>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  const loadAd = useCallback(() => {
    if (!AdModule || !adsEnabled) return;

    // Clean up previous listeners
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    const ad = AdModule.RewardedAd.createForAdRequest(AdModule.TestIds.REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(AdModule.RewardedAdEventType.LOADED, () => {
      setLoaded(true);
    });

    unsubscribersRef.current.push(unsubLoaded);
    ad.load();
    adRef.current = ad;
  }, [adsEnabled]);

  useEffect(() => {
    loadAd();
    return () => {
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
    };
  }, [loadAd]);

  const showAd = useCallback(async (): Promise<boolean> => {
    if (!AdModule || !adRef.current || !loaded) return false;

    return new Promise((resolve) => {
      const unsub = adRef.current.addAdEventListener(
        AdModule!.RewardedAdEventType.EARNED_REWARD,
        () => {
          unsub();
          resolve(true);
        }
      );

      adRef.current.show().catch(() => {
        unsub();
        resolve(false);
      });
    });
  }, [loaded]);

  const reloadAd = useCallback(() => {
    setLoaded(false);
    loadAd();
  }, [loadAd]);

  return { loaded: loaded && adsEnabled && !!AdModule, showAd, reloadAd };
}
