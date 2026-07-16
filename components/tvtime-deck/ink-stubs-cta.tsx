/**
 * "Ink your blank stubs" call-to-action for the import done screen (mock frame
 * 5). Self-hiding: renders nothing unless the deck flag is on and the just-
 * imported library actually has unrated items to ink, so the import flow reads
 * unchanged when the deck is disabled or there's nothing to rate.
 */

import { Pressable, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { hapticImpact } from '@/lib/haptics';
import { useTvTimeImportDeckGate, useTvTimeDeck } from '@/hooks/use-tvtime-deck';
import { buildDeckQueue } from '@/lib/tvtime-deck/deck-logic';

export function InkStubsCta() {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { enabled } = useTvTimeImportDeckGate();
  const { data } = useTvTimeDeck(user?.id, enabled);

  if (!enabled || !data) return null;
  const remaining = buildDeckQueue(data.eligible, data.skippedKeys).length;
  if (remaining === 0) return null;

  const onPress = () => {
    hapticImpact();
    router.replace('/tvtime-deck');
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: colors.tint }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel="Ink your blank stubs"
    >
      <Text style={styles.btnText}>Ink your blank stubs</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center' },
  btnText: { ...Typography.button.primary, color: '#ffffff' },
});
