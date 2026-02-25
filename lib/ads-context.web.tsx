import React, { createContext, useContext, useMemo } from 'react';

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
  const value = useMemo(
    () => ({ adsEnabled: false, adsReady: false, setAdsEnabled: () => {} }),
    []
  );

  return (
    <AdsContext.Provider value={value}>
      {children}
    </AdsContext.Provider>
  );
}

export const useAds = () => useContext(AdsContext);
