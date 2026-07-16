/**
 * Home surface for the blank-stubs deck (mock frame 7): "Ink your imported
 * stubs · N of M inked · pick up where you left off" with a thin progress bar
 * and CONTINUE. Only renders when the flag is on and there is unrated imported
 * work to do. Dismissible and optional forever — dismissal persists per-user, so
 * the card never nags; the deck stays reachable from the import flow.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { hapticImpact } from '@/lib/haptics';
import { useTvTimeImportDeckGate, useTvTimeDeck } from '@/hooks/use-tvtime-deck';
import { buildDeckQueue } from '@/lib/tvtime-deck/deck-logic';

const dismissKey = (userId: string) => `tvtime_deck_home_dismissed:${userId}`;

export function InkStubsCard() {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);

  const { enabled } = useTvTimeImportDeckGate();
  const { data } = useTvTimeDeck(user?.id, enabled);

  const [dismissed, setDismissed] = useState(true); // start hidden until we've checked
  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(dismissKey(user.id))
      .then((v) => setDismissed(v === 'true'))
      .catch(() => setDismissed(false));
  }, [user?.id]);

  if (!enabled || !data || dismissed) return null;

  const remaining = buildDeckQueue(data.eligible, data.skippedKeys).length;
  if (remaining === 0) return null; // nothing to ink → no card

  const { inked, totalEligible } = data.progress;
  const pct = totalEligible > 0 ? Math.min(100, Math.round((inked / totalEligible) * 100)) : 0;

  const onContinue = () => {
    hapticImpact();
    router.push('/tvtime-deck');
  };
  const onDismiss = () => {
    hapticImpact();
    setDismissed(true);
    if (user?.id) AsyncStorage.setItem(dismissKey(user.id), 'true').catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Ink your imported stubs</Text>
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        {inked} of {totalEligible} inked · pick up where you left off
      </Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
      <Pressable onPress={onContinue} hitSlop={8} accessibilityRole="button" accessibilityLabel="Continue inking your stubs">
        <Text style={styles.cta}>CONTINUE →</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.xl,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { ...Typography.body.base, color: colors.text, fontFamily: Fonts.inter.semibold },
    dismiss: { ...Typography.body.base, color: colors.textTertiary },
    sub: { ...Typography.body.sm, color: colors.textSecondary, marginTop: 4 },
    bar: {
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.backgroundSecondary,
      overflow: 'hidden',
      marginTop: Spacing.sm,
    },
    barFill: { height: '100%', borderRadius: 999, backgroundColor: colors.tint },
    cta: {
      ...Typography.body.sm,
      color: colors.tint,
      fontFamily: Fonts.inter.semibold,
      letterSpacing: 0.5,
      marginTop: Spacing.sm,
    },
  });
