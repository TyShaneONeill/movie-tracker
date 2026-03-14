/**
 * PremiumGate Component
 * Wrapper that renders children normally for premium users, or with a
 * lock overlay / badge / disabled state for free users.
 *
 * On tap of locked content, opens the UpgradePromptSheet.
 */

import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '@/hooks/use-premium';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { PremiumBadge } from '@/components/premium/premium-badge';
import { UpgradePromptSheet } from '@/components/premium/upgrade-prompt-sheet';
import type { PremiumFeatureKey } from '@/lib/premium-features';

interface PremiumGateProps {
  /** Which premium feature this gate protects */
  featureKey: PremiumFeatureKey;
  children: React.ReactNode;
  /**
   * 'overlay': dims children + lock icon on top. Tap triggers upgrade prompt.
   * 'badge': renders children normally with a PremiumBadge in the top-right corner.
   * 'disable': sets pointerEvents none + reduced opacity. Tap triggers upgrade prompt.
   */
  mode?: 'overlay' | 'badge' | 'disable';
  /** Optional fallback to render instead of gated children */
  fallback?: React.ReactNode;
}

/**
 * PremiumGate - wraps content that requires a premium subscription.
 *
 * @example
 * <PremiumGate featureKey="advanced_stats">
 *   <AdvancedStatsPanel />
 * </PremiumGate>
 *
 * <PremiumGate featureKey="calendar_genre_filter" mode="badge">
 *   <GenreFilterButton />
 * </PremiumGate>
 */
export function PremiumGate({
  featureKey,
  children,
  mode = 'overlay',
  fallback,
}: PremiumGateProps) {
  const { checkFeature } = usePremium();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [promptVisible, setPromptVisible] = useState(false);

  const isUnlocked = checkFeature(featureKey);

  // Premium users see children with no modification
  if (isUnlocked) {
    return <>{children}</>;
  }

  // If a fallback is provided, render it instead
  if (fallback) {
    return <>{fallback}</>;
  }

  if (mode === 'overlay') {
    return (
      <>
        <Pressable
          style={styles.overlayContainer}
          onPress={() => setPromptVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Premium feature. Tap to upgrade."
        >
          {/* Dimmed children */}
          <View style={styles.dimmedContent} pointerEvents="none">
            {children}
          </View>

          {/* Lock overlay */}
          <View style={styles.lockOverlay}>
            <View style={[styles.lockBadge, { backgroundColor: colors.card }]}>
              <Ionicons name="lock-closed" size={20} color={colors.gold} />
            </View>
          </View>
        </Pressable>

        <UpgradePromptSheet
          visible={promptVisible}
          featureKey={featureKey}
          onClose={() => setPromptVisible(false)}
        />
      </>
    );
  }

  if (mode === 'badge') {
    return (
      <>
        <Pressable
          style={styles.badgeContainer}
          onPress={() => setPromptVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Premium feature. Tap to upgrade."
        >
          {children}
          <View style={styles.badgePosition}>
            <PremiumBadge size="sm" />
          </View>
        </Pressable>

        <UpgradePromptSheet
          visible={promptVisible}
          featureKey={featureKey}
          onClose={() => setPromptVisible(false)}
        />
      </>
    );
  }

  // mode === 'disable'
  return (
    <>
      <Pressable
        style={styles.disableContainer}
        onPress={() => setPromptVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Premium feature. Tap to upgrade."
      >
        <View style={styles.disabledContent} pointerEvents="none">
          {children}
        </View>
      </Pressable>

      <UpgradePromptSheet
        visible={promptVisible}
        featureKey={featureKey}
        onClose={() => setPromptVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'relative',
  },
  dimmedContent: {
    opacity: 0.4,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeContainer: {
    position: 'relative',
  },
  badgePosition: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },
  disableContainer: {
    position: 'relative',
  },
  disabledContent: {
    opacity: 0.5,
  },
});
