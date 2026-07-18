/**
 * Review Prompt Sheet
 *
 * One-time, tasteful ask shown ~2s after the TV Time import done screen
 * renders a fresh completion with >0 items imported. Never re-shown once
 * dismissed either way — see lib/review-prompt-service.ts for the state
 * machine.
 *
 * Copy is neutral by design (no "rate us 5 stars" — Apple 5.6.4 risk) since
 * this deep-links to the store listing rather than the native OS review
 * dialog (expo-store-review isn't installed; see lib/review-prompt-service.ts).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { TicketIcon } from '@/components/tvtime-import/icons';

interface ReviewPromptSheetProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function ReviewPromptSheet({ visible, onAccept, onDecline }: ReviewPromptSheetProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Guards against a fast double-tap firing onAccept/onDecline (and, for
  // accept, Linking.openURL) twice — first tap wins, both buttons disable.
  const [handled, setHandled] = useState(false);
  useEffect(() => {
    if (visible) setHandled(false);
  }, [visible]);

  const handleAccept = () => {
    if (handled) return;
    setHandled(true);
    hapticImpact();
    onAccept();
  };

  const handleDecline = () => {
    if (handled) return;
    setHandled(true);
    hapticImpact();
    onDecline();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDecline}>
      <Pressable style={styles.overlay} onPress={handleDecline}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconContainer, { backgroundColor: colors.tint + '20' }]}>
            <TicketIcon color={colors.tint} size={32} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Enjoying PocketStubs?</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Your TV Time history just became a stack of stubs. If you have a moment, a review
            helps other movie fans find us.
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              disabled={handled}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed || handled ? 0.9 : 1 },
              ]}
              onPress={handleAccept}
              accessibilityLabel="Leave a review"
            >
              <Text style={styles.primaryButtonText}>Sure!</Text>
            </Pressable>

            <Pressable
              disabled={handled}
              style={({ pressed }) => [styles.textButton, { opacity: pressed || handled ? 0.7 : 1 }]}
              onPress={handleDecline}
              accessibilityLabel="Not now"
            >
              <Text style={[styles.textButtonText, { color: colors.textSecondary }]}>Not Now</Text>
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
