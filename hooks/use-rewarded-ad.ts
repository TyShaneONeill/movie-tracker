import { useCallback, useEffect, useRef, useState } from 'react';
import { useAds } from '@/lib/ads-context';
import { captureMessage } from '@/lib/sentry';

// Guarded require for Expo Go compatibility.
// Web uses use-rewarded-ad.web.ts instead (no native ads on web).
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
  const { adsReady } = useAds();
  const [loaded, setLoaded] = useState(false);
  const adRef = useRef<any>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  const loadAd = useCallback(() => {
    if (!AdModule || !adsReady) return;

    // Clean up previous listeners
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    const adUnitId = __DEV__
      ? AdModule.TestIds.REWARDED
      : 'ca-app-pub-5311715630678079/1683046782';
    const ad = AdModule.RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(AdModule.RewardedAdEventType.LOADED, () => {
      console.log('[AdMob] Rewarded ad loaded');
      setLoaded(true);
    });

    const unsubError = ad.addAdEventListener('error', (error: Error) => {
      console.warn('[AdMob] Rewarded ad failed to load:', error.message);
      captureMessage('AdMob rewarded ad failed', {
        error: error.message,
      });
    });

    unsubscribersRef.current.push(unsubLoaded, unsubError);
    ad.load();
    adRef.current = ad;
  }, [adsReady]);

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

  return { loaded: loaded && adsReady && !!AdModule, showAd, reloadAd };
}
