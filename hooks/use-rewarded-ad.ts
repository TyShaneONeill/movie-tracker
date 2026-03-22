import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAds } from '@/lib/ads-context';
import { captureMessage } from '@/lib/sentry';

export function useRewardedAd() {
  const { adsReady } = useAds();

  // Lazily require GMA to avoid native module init at module load time (iOS 26 crash fix)
  const adModule = useMemo(() => {
    try {
      const ads = require('react-native-google-mobile-ads');
      return {
        RewardedAd: ads.RewardedAd,
        RewardedAdEventType: ads.RewardedAdEventType,
        TestIds: ads.TestIds,
      };
    } catch {
      return null; // Not available (Expo Go)
    }
  }, []);
  const [loaded, setLoaded] = useState(false);
  const adRef = useRef<any>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  const loadAd = useCallback(() => {
    if (!adModule || !adsReady) return;

    // Clean up previous listeners
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    const adUnitId = __DEV__
      ? adModule.TestIds.REWARDED
      : 'ca-app-pub-5311715630678079/1683046782';
    const ad = adModule.RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(adModule.RewardedAdEventType.LOADED, () => {
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
  }, [adsReady, adModule]);

  useEffect(() => {
    loadAd();
    return () => {
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
    };
  }, [loadAd]);

  const showAd = useCallback(async (): Promise<boolean> => {
    if (!adModule || !adRef.current || !loaded) return false;

    return new Promise((resolve) => {
      const unsub = adRef.current.addAdEventListener(
        adModule!.RewardedAdEventType.EARNED_REWARD,
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
  }, [loaded, adModule]);

  const reloadAd = useCallback(() => {
    setLoaded(false);
    loadAd();
  }, [loadAd]);

  return { loaded: loaded && adsReady && !!adModule, showAd, reloadAd };
}
