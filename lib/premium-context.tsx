import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Platform, Linking } from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { useAds } from '@/lib/ads-context';
import { fetchSubscriptionStatus } from '@/lib/premium-service';
import { isFeatureAvailable } from '@/lib/premium-features';
import { captureException } from '@/lib/sentry';
import type { PremiumTier, PremiumFeatureKey } from '@/lib/premium-features';
import { isNativeAvailable } from '@/lib/native-purchases';

// RevenueCat API keys
const REVENUECAT_WEB_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY || '';
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';

function getNativeApiKey(): string {
  if (Platform.OS === 'ios') return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return REVENUECAT_ANDROID_API_KEY;
  return '';
}

interface PremiumContextType {
  /** Current tier: 'free', 'plus', or 'dev' */
  tier: PremiumTier;
  /** Convenience: true if user has PocketStubs+ (or dev) */
  isPremium: boolean;
  /** Whether the premium state is still loading */
  isLoading: boolean;
  /** Current subscription info from RevenueCat (null if free or unavailable) */
  subscription: SubscriptionInfo | null;
  /** Platform-appropriate management URL: Apple/Play deep link on native, Stripe portal on web */
  managementUrl: string | null;
  /** Check if a specific feature is unlocked for the current tier */
  checkFeature: (featureKey: PremiumFeatureKey) => boolean;
  /** Purchase a package via RevenueCat / Stripe Checkout */
  purchasePackage: (packageToPurchase: unknown) => Promise<PurchaseResult>;
  /** Restore purchases via RevenueCat */
  restorePurchases: () => Promise<RestoreResult>;
  /** Open the platform-appropriate subscription management UI */
  manageSubscription: () => Promise<ManageSubscriptionResult>;
}

export interface SubscriptionInfo {
  tier: 'plus';
  productId: string;
  store: string;
  expiresAt: Date | null;
  isTrialActive: boolean;
  willRenew: boolean;
}

export interface PurchaseResult {
  success: boolean;
  error?: string;
}

export interface RestoreResult {
  restored: boolean;
  tier: PremiumTier;
  message: string;
}

export interface ManageSubscriptionResult {
  success: boolean;
  error?: string;
}

const PremiumContext = createContext<PremiumContextType>({
  tier: 'free',
  isPremium: false,
  isLoading: true,
  subscription: null,
  managementUrl: null,
  checkFeature: () => false,
  purchasePackage: async () => ({ success: false, error: 'Not initialized' }),
  restorePurchases: async () => ({ restored: false, tier: 'free', message: 'Not initialized' }),
  manageSubscription: async () => ({ success: false, error: 'Not initialized' }),
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setAdsEnabled } = useAds();

  const [tier, setTier] = useState<PremiumTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [purchasesInstance, setPurchasesInstance] = useState<any>(null);
  const [isNativeInitialized, setIsNativeInitialized] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const nativePurchasesRef = useRef<any>(null);

  const isPremium = tier === 'plus' || tier === 'dev';

  // Disable ads when premium is active
  useEffect(() => {
    setAdsEnabled(!isPremium);
  }, [isPremium, setAdsEnabled]);

  // Load subscription status from Supabase profile on mount / user change
  useEffect(() => {
    if (!user) {
      setTier('free');
      setSubscription(null);
      setManagementUrl(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadStatus = async () => {
      try {
        const status = await fetchSubscriptionStatus(user.id);

        if (cancelled) return;

        setTier(status.tier);

        // Dev accounts bypass everything — no RevenueCat needed
        if (status.tier === 'dev') {
          setIsLoading(false);
          return;
        }

        // Initialize RevenueCat for authenticated non-dev users
        await initRevenueCat(user.id);
      } catch (error) {
        if (cancelled) return;
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'premium-load-status',
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadStatus();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Clean up RevenueCat on sign out
  useEffect(() => {
    if (!user && purchasesInstance) {
      setPurchasesInstance(null);
    }
  }, [user, purchasesInstance]);

  /** Initialize RevenueCat — native SDK on iOS/Android, web SDK on web */
  const initRevenueCat = async (userId: string) => {
    try {
      if (isNativeAvailable && Platform.OS !== 'web') {
        await initRevenueCatNative(userId);
      } else {
        await initRevenueCatWeb(userId);
      }
    } catch (error) {
      console.warn('[PremiumProvider] RevenueCat init failed:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-revenuecat-init',
      });
    }
  };

  /** Initialize react-native-purchases (iOS / Android) */
  const initRevenueCatNative = async (userId: string) => {
    const apiKey = getNativeApiKey();
    if (!apiKey) return;

    try {
      // Dynamic import prevents react-native-purchases module-level code
      // (NativeEventEmitter, listener registration) from running at startup
      const { default: Purchases } = await import('react-native-purchases');
      nativePurchasesRef.current = Purchases;

      Purchases.configure({ apiKey, appUserID: userId });
      setIsNativeInitialized(true);

      const customerInfo = await Purchases.getCustomerInfo();
      deriveStateFromCustomerInfo(customerInfo);

      const offerings = await Purchases.getOfferings();
      const packages = offerings?.current?.availablePackages ?? [];
      setAvailablePackages(packages);
    } catch (error) {
      console.warn('[PremiumProvider] RevenueCat native init failed:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-revenuecat-native-init',
      });
    }
  };

  /** Initialize @revenuecat/purchases-js (web) */
  const initRevenueCatWeb = async (userId: string) => {
    // Dynamic import — web-only SDK, must not be statically imported for native builds
    const rcModule = await import('@revenuecat/purchases-js');
    const Purchases = (rcModule as any).Purchases;

    const instance = Purchases.configure(REVENUECAT_WEB_API_KEY, userId);
    setPurchasesInstance(instance);

    const customerInfo = await instance.getCustomerInfo();
    deriveStateFromCustomerInfo(customerInfo);

    try {
      const offerings = await instance.getOfferings();
      const currentOffering = offerings?.current;
      if (currentOffering?.availablePackages) {
        setAvailablePackages(currentOffering.availablePackages);
      }
    } catch (offeringsError) {
      console.warn('[PremiumProvider] Failed to fetch web offerings:', offeringsError);
    }
  };

  /** Derive tier and subscription info from RevenueCat CustomerInfo */
  const deriveStateFromCustomerInfo = (customerInfo: any) => {
    try {
      const plusEntitlement = customerInfo?.entitlements?.active?.['plus'];

      // RevenueCat populates managementURL for active subs across all stores:
      // App Store → itms-apps://, Play Store → https://play.google.com/...,
      // Web Billing → RevenueCat-hosted Stripe customer portal URL
      const url = customerInfo?.managementURL ?? null;
      setManagementUrl(typeof url === 'string' && url.length > 0 ? url : null);

      if (plusEntitlement) {
        setTier('plus');
        setSubscription({
          tier: 'plus',
          productId: plusEntitlement.productIdentifier || '',
          store: plusEntitlement.store || 'stripe',
          expiresAt: plusEntitlement.expirationDate
            ? new Date(plusEntitlement.expirationDate)
            : null,
          isTrialActive: plusEntitlement.periodType === 'trial',
          willRenew: !plusEntitlement.willRenew === false, // default true if not set
        });
      } else {
        // No active plus entitlement in RevenueCat — keep DB tier as fallback
        setSubscription(null);
      }
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-derive-state',
      });
    }
  };

  /** Open the platform-appropriate subscription management UI */
  const manageSubscription = useCallback(async (): Promise<ManageSubscriptionResult> => {
    if (!managementUrl) {
      return { success: false, error: 'Subscription management is not available right now.' };
    }

    try {
      if (Platform.OS === 'web') {
        const opened = window.open(managementUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          return { success: false, error: 'Pop-up blocked. Allow pop-ups for pocketstubs.com and try again.' };
        }
      } else {
        await Linking.openURL(managementUrl);
      }
      return { success: true };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-manage-subscription',
      });
      return { success: false, error: 'Could not open subscription management. Please try again.' };
    }
  }, [managementUrl]);

  /** Purchase a package via RevenueCat (StoreKit on native, Stripe Checkout on web) */
  const purchasePackage = useCallback(async (packageToPurchase: unknown): Promise<PurchaseResult> => {
    const isNative = isNativeAvailable && Platform.OS !== 'web';
    if (isNative ? !isNativeInitialized : !purchasesInstance) {
      return { success: false, error: 'Purchases not initialized' };
    }

    try {
      // Resolve string identifiers ('monthly', 'yearly') to the actual RC package object
      let rcPackage = packageToPurchase;
      if (typeof packageToPurchase === 'string') {
        const packageTypeMap: Record<string, { type: string; rcId: string }> = {
          monthly: { type: 'MONTHLY', rcId: '$rc_monthly' },
          yearly: { type: 'ANNUAL', rcId: '$rc_annual' },
          lifetime: { type: 'LIFETIME', rcId: '$rc_lifetime' },
        };
        const mapped = packageTypeMap[packageToPurchase];

        rcPackage = availablePackages.find(
          (pkg: any) => pkg.rcBillingProduct?.identifier === packageToPurchase
            || pkg.identifier === packageToPurchase
            || pkg.webBillingProduct?.identifier === packageToPurchase
            || (mapped && (pkg.packageType === mapped.type || pkg.identifier === mapped.rcId))
        );
        if (!rcPackage) {
          return { success: false, error: `Package "${packageToPurchase}" not found in offerings. Available: ${availablePackages.map((p: any) => `${p.identifier}(${p.packageType})`).join(', ')}` };
        }
      }

      let customerInfo: any;
      if (isNative && nativePurchasesRef.current) {
        const result = await nativePurchasesRef.current.purchasePackage(rcPackage as any);
        customerInfo = result?.customerInfo;
      } else {
        const result = await purchasesInstance.purchase({ rcPackage });
        customerInfo = result?.customerInfo;
      }

      if (customerInfo) {
        deriveStateFromCustomerInfo(customerInfo);
      }

      return { success: true };
    } catch (error: any) {
      const isCancellation = error?.userCancelled
        || error?.code === 'CANCELLED'
        || error?.code === 'USER_CANCELLED'
        || error?.message?.toLowerCase()?.includes('cancel')
        || error?.message?.toLowerCase()?.includes('closed')
        || error?.message?.toLowerCase()?.includes('dismissed');
      if (isCancellation) {
        return { success: false };
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-purchase',
      });
      return {
        success: false,
        error: error?.message || 'Purchase failed. Please try again.',
      };
    }
  }, [purchasesInstance, isNativeInitialized, availablePackages]);

  /** Restore purchases via RevenueCat */
  const restorePurchases = useCallback(async (): Promise<RestoreResult> => {
    const isNative = isNativeAvailable && Platform.OS !== 'web';
    if (isNative ? !isNativeInitialized : !purchasesInstance) {
      return { restored: false, tier: 'free', message: 'Purchases not initialized' };
    }

    try {
      let customerInfo: any;
      if (isNative && nativePurchasesRef.current) {
        customerInfo = await nativePurchasesRef.current.restorePurchases();
      } else {
        customerInfo = await purchasesInstance.getCustomerInfo();
      }

      deriveStateFromCustomerInfo(customerInfo);

      const plusEntitlement = customerInfo?.entitlements?.active?.['plus'];
      if (plusEntitlement) {
        return { restored: true, tier: 'plus', message: 'Your PocketStubs+ subscription has been restored!' };
      }

      return { restored: false, tier: 'free', message: 'No active subscription found.' };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-restore',
      });
      return {
        restored: false,
        tier: 'free',
        message: 'Could not restore purchases. Please try again.',
      };
    }
  }, [purchasesInstance, isNativeInitialized]);

  /** Check if a specific feature is unlocked for the current tier */
  const checkFeature = useCallback(
    (featureKey: PremiumFeatureKey) => isFeatureAvailable(featureKey, tier),
    [tier]
  );

  const value = useMemo<PremiumContextType>(
    () => ({
      tier,
      isPremium,
      isLoading,
      subscription,
      managementUrl,
      checkFeature,
      purchasePackage,
      restorePurchases,
      manageSubscription,
    }),
    [tier, isPremium, isLoading, subscription, managementUrl, checkFeature, purchasePackage, restorePurchases, manageSubscription]
  );

  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const context = useContext(PremiumContext);
  if (context === undefined) {
    throw new Error('usePremium must be used within a PremiumProvider');
  }
  return context;
}
