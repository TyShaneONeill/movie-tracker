/**
 * Ink→take bridge (Post-Import Takes). After a user inks (rates) an imported
 * stub, this slim strip floats in and offers ONE optional tap to also say a
 * line about it — opening the First Take composer pre-filled with the rating
 * they just chose. It rides the existing ink habit loop; it is NEVER a gate.
 *
 * Product rule (Ty): an invitation, not a checklist — no counters, no "0 of N",
 * no guilt. A pure inker ignores it and it slips away on its own (the parent
 * auto-dismisses it and replaces it on the next ink). ONE tap to open, ONE tap
 * (the ✕) to dismiss. Keyed by item id in the parent so a new ink mounts a
 * fresh strip and no state leaks between titles (standing rule).
 */

import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { hapticSelection } from '@/lib/haptics';
import type { DeckItem } from '@/lib/tvtime-deck/deck-logic';

interface InkTakeBridgeStripProps {
  item: DeckItem;
  reduced: boolean;
  onTap: (item: DeckItem) => void;
  onDismiss: (item: DeckItem) => void;
}

export function InkTakeBridgeStrip({ item, reduced, onTap, onDismiss }: InkTakeBridgeStripProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);

  // Subtle rise-in so the invitation reads as arriving after the ink, not as a
  // permanent chrome element (respects Reduce Motion).
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    enter.value = reduced ? 1 : withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [enter, reduced]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 12 }],
  }));

  return (
    <Animated.View style={[styles.wrap, enterStyle]}>
      <Pressable
        style={({ pressed }) => [styles.strip, pressed && { opacity: 0.85 }]}
        onPress={() => {
          hapticSelection();
          onTap(item);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Say a line about ${item.title}`}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.tint} />
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            Say a line about {item.title}
          </Text>
          <Text style={styles.sub}>Turn your ink into a First Take</Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.tint} />
      </Pressable>
      <Pressable
        onPress={() => onDismiss(item)}
        hitSlop={10}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={16} color={colors.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      width: '88%',
      ...(Platform.OS === 'web' ? { maxWidth: 440 } : {}),
      backgroundColor: colors.card,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      paddingLeft: Spacing.md,
      paddingRight: Spacing.sm,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 6,
    },
    strip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    textCol: { flex: 1, minWidth: 0 },
    title: { ...Typography.body.sm, color: colors.text, fontFamily: Fonts.inter.semibold },
    sub: { ...Typography.body.xs, color: colors.textTertiary, marginTop: 1 },
    dismiss: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
