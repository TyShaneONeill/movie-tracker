/**
 * Acquisition Source Prompt
 *
 * One-time, one-tap "what brought you here?" sheet shown on Home right after
 * a brand-new user finishes onboarding. Never blocking, never re-shown —
 * see lib/acquisition-service.ts for the gate. Tapping a chip shows a brief
 * thank-you beat, then the sheet leaves for good.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { AcquisitionSource } from '@/lib/acquisition-service';

interface AcquisitionSourcePromptProps {
  visible: boolean;
  /** Persists the answer. Called the instant a chip is tapped, before the beat. */
  onSelect: (source: AcquisitionSource) => void;
  /** Hides the sheet once the thank-you beat has played. */
  onClose: () => void;
  onDismiss: () => void;
}

const CHIPS: { source: AcquisitionSource; label: string }[] = [
  { source: 'producthunt', label: 'Product Hunt' },
  { source: 'alternativeto', label: 'AlternativeTo' },
  { source: 'x', label: 'X (Twitter)' },
  { source: 'friend', label: 'A friend' },
  { source: 'search', label: 'Search' },
  { source: 'other', label: 'Somewhere else' },
];

// How long the thank-you beat stays up before the sheet leaves for good.
const THANKS_DISMISS_MS = 1400;

// Inline SVG (not @expo/vector-icons) — same reasoning as
// notification-priming-sheet.tsx: keeps this out of the expo-font/expo-asset
// dependency graph that existing hook tests don't mock.
function MapPinIcon({ color }: { color: string }) {
  return (
    <Svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" />
      <Circle cx="12" cy="10" r="3" />
    </Svg>
  );
}

export function AcquisitionSourcePrompt({
  visible,
  onSelect,
  onClose,
  onDismiss,
}: AcquisitionSourcePromptProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [thanked, setThanked] = useState(false);

  const handleChipPress = (source: AcquisitionSource) => {
    if (thanked) return;
    hapticImpact();
    setThanked(true);
    // Persist FIRST, then play the beat. Backgrounding or force-quitting during
    // the 1.4s thank-you must not lose the answer the user just gave us.
    onSelect(source);
    setTimeout(onClose, THANKS_DISMISS_MS);
  };

  const handleDismiss = () => {
    if (thanked) return;
    hapticImpact();
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {thanked ? (
            <View style={styles.thanksContainer}>
              <Text style={[styles.title, { color: colors.text }]}>
                Noted — enjoy the show.
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.iconContainer, { backgroundColor: colors.tint + '20' }]}>
                <MapPinIcon color={colors.tint} />
              </View>

              <Text style={[styles.title, { color: colors.text }]}>
                One last thing — what brought you here?
              </Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                One tap and we&rsquo;re done. It helps us find more people like you.
              </Text>

              <View style={styles.chipsContainer}>
                {CHIPS.map(({ source, label }) => (
                  <Pressable
                    key={source}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    onPress={() => handleChipPress(source)}
                    accessibilityLabel={label}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.7 : 1 }]}
                onPress={handleDismiss}
                accessibilityLabel="Skip"
              >
                <Text style={[styles.textButtonText, { color: colors.textSecondary }]}>
                  Skip
                </Text>
              </Pressable>
            </>
          )}
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
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    ...Typography.body.base,
    fontWeight: '500',
  },
  thanksContainer: {
    paddingVertical: Spacing.xl,
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
