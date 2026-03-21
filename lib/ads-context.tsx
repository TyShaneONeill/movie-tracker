import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { captureException } from '@/lib/sentry';

// react-native-google-mobile-ads is NOT imported here — doing so executes module-level
// initialization code (NativeEventEmitter, listener registration) that crashes on iOS 26.4 beta
// via ObjCTurboModule::performVoidMethodInvocation. The module is loaded lazily inside
// AdsProvider's useEffect only when ads are enabled.

interface AdsContextType {
  adsEnabled: boolean;
  adsReady: boolean;
  setAdsEnabled: (enabled: boolean) => void;
}

const AdsContext = createContext<AdsContextType>({
  adsEnabled: true,
  adsReady: false,
  setAdsEnabled: () => {},
});

export function AdsProvider({ children }: { children: React.ReactNode }) {
  // Ads enabled by default, disabled in dev mode.
  // Premium users: PremiumProvider calls setAdsEnabled(false) when isPremium is true.
  const [adsEnabled, setAdsEnabled] = useState(!__DEV__);
  const [adsInitialized, setAdsInitialized] = useState(false);

  useEffect(() => {
    if (!adsEnabled) return;

    (async () => {
      try {
        // Dynamic require prevents react-native-google-mobile-ads module-level code
        // (NativeEventEmitter, listener registration) from running at startup.
        let mobileAds: (() => { initialize: () => Promise<any> }) | null = null;
        try {
          const ads = require('react-native-google-mobile-ads');
          mobileAds = ads.default;
        } catch {
          return; // Native module not available (e.g., Expo Go)
        }
        if (!mobileAds) return;
        await mobileAds().initialize();
        setAdsInitialized(true);
      } catch (error) {
        console.warn('[AdMob] SDK initialization failed:', error);
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'admob_initialization',
        });
      }
    })();
  }, [adsEnabled]);

  const adsReady = adsEnabled && adsInitialized;

  const value = useMemo(
    () => ({ adsEnabled, adsReady, setAdsEnabled }),
    [adsEnabled, adsReady, setAdsEnabled]
  );

  return (
    <AdsContext.Provider value={value}>
      {children}
    </AdsContext.Provider>
  );
}

export const useAds = () => useContext(AdsContext);
