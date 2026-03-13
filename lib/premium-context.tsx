import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAds } from '@/lib/ads-context';
import { fetchSubscriptionStatus } from '@/lib/premium-service';
import { isFeatureAvailable } from '@/lib/premium-features';
import { captureException } from '@/lib/sentry';
import type { PremiumTier, PremiumFeatureKey } from '@/lib/premium-features';

// RevenueCat Web SDK API key (from .env.local)
const REVENUECAT_WEB_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY || '';

interface PremiumContextType {
  /** Current tier: 'free', 'plus', or 'dev' */
  tier: PremiumTier;
  /** Convenience: true if user has CineTrak+ (or dev) */
  isPremium: boolean;
  /** Whether the premium state is still loading */
  isLoading: boolean;
  /** Current subscription info from RevenueCat (null if free or unavailable) */
  subscription: SubscriptionInfo | null;
  /** Check if a specific feature is unlocked for the current tier */
  checkFeature: (featureKey: PremiumFeatureKey) => boolean;
  /** Purchase a package via RevenueCat / Stripe Checkout */
  purchasePackage: (packageToPurchase: unknown) => Promise<PurchaseResult>;
  /** Restore purchases via RevenueCat */
  restorePurchases: () => Promise<RestoreResult>;
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

const PremiumContext = createContext<PremiumContextType>({
  tier: 'free',
  isPremium: false,
  isLoading: true,
  subscription: null,
  checkFeature: () => false,
  purchasePackage: async () => ({ success: false, error: 'Not initialized' }),
  restorePurchases: async () => ({ restored: false, tier: 'free', message: 'Not initialized' }),
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setAdsEnabled } = useAds();

  const [tier, setTier] = useState<PremiumTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [purchasesInstance, setPurchasesInstance] = useState<any>(null);

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

  /** Initialize RevenueCat web SDK and identify the user */
  const initRevenueCat = async (userId: string) => {
    try {
      // Dynamic import — package must be installed: npm install @revenuecat/purchases-js
      const { Purchases } = await import(/* webpackIgnore: true */ '@revenuecat/purchases-js' as string) as { Purchases: any };

      const instance = Purchases.configure(REVENUECAT_WEB_API_KEY, userId);
      setPurchasesInstance(instance);

      // Fetch current customer info to check entitlements
      const customerInfo = await instance.getCustomerInfo();
      deriveStateFromCustomerInfo(customerInfo);
    } catch (error) {
      // RevenueCat unavailable — fall back to DB tier (already set above)
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'premium-revenuecat-init',
      });
    }
  };

  /** Derive tier and subscription info from RevenueCat CustomerInfo */
  const deriveStateFromCustomerInfo = (customerInfo: any) => {
    try {
      const plusEntitlement = customerInfo?.entitlements?.active?.['plus'];

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

  /** Purchase a package via RevenueCat (triggers Stripe Checkout on web) */
  const purchasePackage = useCallback(async (packageToPurchase: unknown): Promise<PurchaseResult> => {
    if (!purchasesInstance) {
      return { success: false, error: 'Purchases not initialized' };
    }

    try {
      const result = await purchasesInstance.purchase({ rcPackage: packageToPurchase as any });

      if (result?.customerInfo) {
        deriveStateFromCustomerInfo(result.customerInfo);
      }

      return { success: true };
    } catch (error: any) {
      // User cancelled is not an error
      if (error?.userCancelled) {
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
  }, [purchasesInstance]);

  /** Restore purchases via RevenueCat */
  const restorePurchases = useCallback(async (): Promise<RestoreResult> => {
    if (!purchasesInstance) {
      return { restored: false, tier: 'free', message: 'Purchases not initialized' };
    }

    try {
      const customerInfo = await purchasesInstance.getCustomerInfo();
      deriveStateFromCustomerInfo(customerInfo);

      const plusEntitlement = customerInfo?.entitlements?.active?.['plus'];
      if (plusEntitlement) {
        return { restored: true, tier: 'plus', message: 'Your CineTrak+ subscription has been restored!' };
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
  }, [purchasesInstance]);

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
      checkFeature,
      purchasePackage,
      restorePurchases,
    }),
    [tier, isPremium, isLoading, subscription, checkFeature, purchasePackage, restorePurchases]
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
