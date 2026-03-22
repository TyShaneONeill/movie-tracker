/**
 * UpgradePromptSheet Component
 * Bottom sheet modal that prompts free users to upgrade to CineTrak+.
 * Follows the LoginPromptModal pattern (Modal with animationType="slide").
 *
 * Shows feature-specific messaging from the PREMIUM_FEATURES registry.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { PREMIUM_FEATURES, type PremiumFeatureKey } from '@/lib/premium-features';

interface UpgradePromptSheetProps {
  /** Whether the sheet is visible */
  visible: boolean;
  /** The feature key to show messaging for (null hides) */
  featureKey: PremiumFeatureKey | null;
  /** Callback when sheet is closed */
  onClose: () => void;
}

/**
 * UpgradePromptSheet - bottom sheet promoting CineTrak+ upgrade.
 *
 * @example
 * <UpgradePromptSheet
 *   visible={isVisible}
 *   featureKey="advanced_stats"
 *   onClose={() => setIsVisible(false)}
 * />
 */
export function UpgradePromptSheet({
  visible,
  featureKey,
  onClose,
}: UpgradePromptSheetProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const feature = featureKey ? PREMIUM_FEATURES[featureKey] : null;
  const featureIcon = (feature?.icon ?? 'star-outline') as keyof typeof Ionicons.glyphMap;

  const handleSeePlans = () => {
    hapticImpact();
    onClose();
    router.push('/upgrade');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Modal Content */}
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Feature Icon */}
          <View style={[styles.iconContainer, { backgroundColor: colors.gold + '20' }]}>
            <Ionicons name={featureIcon} size={48} color={colors.gold} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            {feature ? `Unlock ${feature.label}` : 'Upgrade to PocketStubs+'}
          </Text>

          {/* Description */}
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {feature?.description ?? 'Get the most out of PocketStubs with premium features.'}
          </Text>

          {/* Tier Badge */}
          <View style={[styles.tierBadge, { backgroundColor: colors.gold + '15' }]}>
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text style={[styles.tierBadgeText, { color: colors.gold }]}>
              Included in PocketStubs+
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.gold, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleSeePlans}
            >
              <Text style={styles.primaryButtonText}>See Plans</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.textButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => {
                hapticImpact();
                onClose();
              }}
            >
              <Text style={[styles.textButtonText, { color: colors.textSecondary }]}>
                Maybe Later
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.display.h3,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...Typography.body.base,
    textAlign: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  tierBadgeText: {
    ...Typography.body.smMedium,
    fontWeight: '600',
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.md,
  },
  primaryButton: {
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  textButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  textButtonText: {
    ...Typography.body.base,
    fontWeight: '500',
  },
});
