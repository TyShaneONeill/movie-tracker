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
    if (__DEV__) return; // Never initialize GMA in dev — native module unavailable in Expo Go

    (async () => {
      try {
        // Dynamic require prevents react-native-google-mobile-ads module-level code
        // (NativeEventEmitter, listener registration) from running at startup.
        let ads: any = null;
        try {
          ads = require('react-native-google-mobile-ads');
        } catch {
          return; // Native module not available (e.g., Expo Go)
        }
        const mobileAds: (() => { initialize: () => Promise<any> }) | null = ads?.default ?? null;
        const AdsConsent = ads?.AdsConsent ?? null;
        if (!mobileAds) return;

        // UMP/GDPR consent (Google CMP). Required before serving personalized ads in
        // the EEA/UK/Switzerland. gatherConsent() pulls the latest consent info and
        // shows the AdMob-configured consent form when the user's region requires it;
        // for non-regulated regions it resolves immediately with canRequestAds=true.
        // A consent failure must NOT block the app — we fall back to the readable
        // consent state and only request ads when allowed (GDPR-safe default: no ads
        // until consent is known).
        if (AdsConsent) {
          try {
            await AdsConsent.gatherConsent();
          } catch (consentError) {
            captureException(consentError instanceof Error ? consentError : new Error(String(consentError)), {
              context: 'admob_consent_gather',
            });
          }

          let canRequestAds = false;
          try {
            const info = await AdsConsent.getConsentInfo();
            canRequestAds = !!info?.canRequestAds;
          } catch {
            canRequestAds = false;
          }
          if (!canRequestAds) return; // Don't initialize/serve ads without consent
        }

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
