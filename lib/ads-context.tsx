import React, { createContext, useContext, useState } from 'react';

interface AdsContextType {
  adsEnabled: boolean;
  setAdsEnabled: (enabled: boolean) => void;
}

const AdsContext = createContext<AdsContextType>({
  adsEnabled: true,
  setAdsEnabled: () => {},
});

export function AdsProvider({ children }: { children: React.ReactNode }) {
  // Ads enabled by default, disabled in dev mode
  // Future: also disable for premium users
  const [adsEnabled, setAdsEnabled] = useState(!__DEV__);

  return (
    <AdsContext.Provider value={{ adsEnabled, setAdsEnabled }}>
      {children}
    </AdsContext.Provider>
  );
}

export const useAds = () => useContext(AdsContext);
