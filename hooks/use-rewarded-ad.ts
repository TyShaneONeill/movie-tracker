import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAds } from '@/lib/ads-context';
import { captureMessage } from '@/lib/sentry';

type RewardedAdType = 'scan' | 'ai';

const REWARDED_AD_UNIT_IDS: Record<RewardedAdType, string> = {
  scan: Platform.select({
    ios: 'ca-app-pub-5311715630678079/3140612381',
    android: 'ca-app-pub-5311715630678079/6016770702',
    default: 'ca-app-pub-5311715630678079/3140612381',
  })!,
  ai: Platform.select({
    ios: 'ca-app-pub-5311715630678079/9584000720',
    android: 'ca-app-pub-5311715630678079/4855732276',
    default: 'ca-app-pub-5311715630678079/9584000720',
  })!,
};

export function useRewardedAd(type: RewardedAdType = 'scan') {
  const { adsReady } = useAds();

  // Lazily require GMA to avoid native module init at module load time (iOS 26 crash fix)
  const adModule = useMemo(() => {
    try {
      const ads = require('react-native-google-mobile-ads');
      return {
        RewardedAd: ads.RewardedAd,
        RewardedAdEventType: ads.RewardedAdEventType,
        AdEventType: ads.AdEventType,
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
      : REWARDED_AD_UNIT_IDS[type];
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
  }, [adsReady, adModule, type]);

  useEffect(() => {
    loadAd();
    return () => {
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
    };
  }, [loadAd]);

  // `onEarned` fires synchronously the instant the reward is earned (before the
  // ad is dismissed), so callers can durably persist a pending credit and
  // survive an app kill during the ad-dismissal window. The returned promise
  // still resolves only after the ad CLOSES (see below).
  const showAd = useCallback(async (onEarned?: () => void): Promise<boolean> => {
    if (!adModule || !adRef.current || !loaded) return false;

    // Resolve only after the ad is DISMISSED (CLOSED), carrying whether the
    // reward was earned — NOT on EARNED_REWARD. EARNED_REWARD fires while the
    // ad activity still owns the foreground, so any network call the caller
    // makes on resolution (grant credit / grant scan) fires into a dead window
    // and throws FunctionsFetchError (issue #592). Waiting for CLOSED means the
    // app is foregrounded and the network is live when the caller acts.
    return new Promise((resolve) => {
      let earned = false;
      let settled = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

      const subs: Array<() => void> = [];
      const cleanup = () => {
        subs.forEach((unsub) => unsub());
        subs.length = 0;
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      subs.push(
        adRef.current.addAdEventListener(
          adModule!.RewardedAdEventType.EARNED_REWARD,
          () => {
            earned = true;
            try {
              onEarned?.();
            } catch {
              // never let a caller's persistence hook break ad resolution
            }
            // Safety net: if CLOSED never arrives (rare SDK edge case), don't
            // hang the caller forever — settle a few seconds after the reward.
            if (!fallbackTimer) {
              fallbackTimer = setTimeout(() => settle(earned), 4000);
            }
          }
        )
      );

      subs.push(
        adRef.current.addAdEventListener(
          adModule!.AdEventType.CLOSED,
          () => settle(earned)
        )
      );

      adRef.current.show().catch(() => settle(false));
    });
  }, [loaded, adModule]);

  const reloadAd = useCallback(() => {
    setLoaded(false);
    loadAd();
  }, [loadAd]);

  return { loaded: loaded && adsReady && !!adModule, showAd, reloadAd };
}
