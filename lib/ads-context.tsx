import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { captureMessage, captureException } from '@/lib/sentry';

// Guarded require for Expo Go compatibility.
// Web uses ads-context.web.tsx instead (no native ads on web).
let mobileAds: (() => { initialize: () => Promise<any> }) | null = null;

try {
  const ads = require('react-native-google-mobile-ads');
  mobileAds = ads.default;
} catch {
  // Native module not available (e.g., Expo Go)
}

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
  // Ads enabled by default, disabled in dev mode
  // Future: also disable for premium users
  const [adsEnabled, setAdsEnabled] = useState(!__DEV__);
  const [adsInitialized, setAdsInitialized] = useState(false);

  useEffect(() => {
    if (!mobileAds || !adsEnabled) return;

    (async () => {
      try {
        await mobileAds!().initialize();
        setAdsInitialized(true);
        console.log('[AdMob] SDK initialized successfully');
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
