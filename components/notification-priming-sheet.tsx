/**
 * Notification Priming Sheet
 *
 * One-time, tasteful ask shown at the first-win moment (first watchlist add
 * or first ticket scan) when push permission is still 'undetermined'. Never
 * shown at launch, never blocking, never re-shown once dismissed either way
 * — see lib/notification-priming-service.ts for the state machine.
 *
 * Copy below is DRAFT — flagged for Content Queue voice review before the
 * day2-bridge cron (which this sheet feeds users into) is scheduled.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface NotificationPrimingSheetProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

// Inline SVG (not @expo/vector-icons) — matches the ChevronLeftIcon pattern in
// app/settings/notifications.tsx and keeps this sheet out of the expo-font/
// expo-asset dependency graph, which several existing hook tests don't mock.
function BellIcon({ color }: { color: string }) {
  return (
    <Svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function NotificationPrimingSheet({
  visible,
  onAccept,
  onDecline,
}: NotificationPrimingSheetProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const handleAccept = () => {
    hapticImpact();
    onAccept();
  };

  const handleDecline = () => {
    hapticImpact();
    onDecline();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDecline}
    >
      <Pressable style={styles.overlay} onPress={onDecline}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconContainer, { backgroundColor: colors.tint + '20' }]}>
            <BellIcon color={colors.tint} />
          </View>

          {/* DRAFT — Content Queue review pending (2026-07-06) */}
          <Text style={[styles.title, { color: colors.text }]}>
            Get a heads-up when your watchlist hits theaters
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            We&rsquo;ll only nudge you about what you&rsquo;ve actually added — nothing else.
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleAccept}
              accessibilityLabel="Turn On Notifications"
            >
              <Text style={styles.primaryButtonText}>Turn On</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleDecline}
              accessibilityLabel="Not Now"
            >
              <Text style={[styles.textButtonText, { color: colors.textSecondary }]}>
                Not Now
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
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.display.h4,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  message: {
    ...Typography.body.base,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.sm,
  },
  primaryButton: {
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  textButtonText: {
    ...Typography.body.base,
    fontWeight: '500',
  },
});
