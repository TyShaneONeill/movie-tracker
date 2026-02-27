import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface AdsContextType {
  adsEnabled: boolean;
  adsReady: boolean;
  setAdsEnabled: (enabled: boolean) => void;
}

const AdsContext = createContext<AdsContextType>({
  adsEnabled: false,
  adsReady: false,
  setAdsEnabled: () => {},
});

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const [adsEnabled, setAdsEnabled] = useState(!__DEV__);
  const [adsReady, setAdsReady] = useState(false);

  useEffect(() => {
    if (!adsEnabled) return;

    // Check if the AdSense script has loaded
    const checkAdsReady = () => {
      if (typeof window !== 'undefined' && (window as any).adsbygoogle) {
        setAdsReady(true);
        return true;
      }
      return false;
    };

    // Already loaded
    if (checkAdsReady()) return;

    // Poll briefly for script load
    const interval = setInterval(() => {
      if (checkAdsReady()) clearInterval(interval);
    }, 200);

    // Give up after 10s
    const timeout = setTimeout(() => {
      clearInterval(interval);
      console.warn('[AdSense] Script did not load within 10s');
    }, 10_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [adsEnabled]);

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
