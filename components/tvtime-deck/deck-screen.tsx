/**
 * The blank-stubs rating deck screen (mock frame 7). Loads the eligible-unrated
 * imported items, presents them as a swipeable card stack in sessions of ~10,
 * and inks each rating as a QUIET review. Resumes exactly on reopen: rated items
 * drop out of the server read, skipped items persist client-side.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';
import { analytics } from '@/lib/analytics';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import { useTvTimeDeck } from '@/hooks/use-tvtime-deck';
import { inkStubRating } from '@/lib/tvtime-deck/deck-service';
import { addSkipped } from '@/lib/tvtime-deck/skip-store';
import {
  buildDeckQueue,
  sessionSlot,
  isSessionCheckpoint,
  type DeckItem,
} from '@/lib/tvtime-deck/deck-logic';
import { DeckCard } from './deck-card';

export function TvTimeDeckScreen() {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);
  const reduced = useReducedMotion();

  const { isLoading, isError, data, refetch } = useTvTimeDeck(user?.id, true);

  // Live queue + session state. Seeded once from the loaded data; thereafter the
  // component owns it so decisions advance instantly (writes happen in the bg).
  const [queue, setQueue] = useState<DeckItem[]>([]);
  const [ratedThisSession, setRatedThisSession] = useState(0);
  const [decidedThisSession, setDecidedThisSession] = useState(0);
  const [checkpoint, setCheckpoint] = useState(false);
  const [busy, setBusy] = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (data && !seededRef.current) {
      seededRef.current = true;
      const initial = buildDeckQueue(data.eligible, data.skippedKeys);
      setQueue(initial);
      analytics.track('deck_opened', {
        eligible_count: initial.length,
        inked: data.progress.inked,
        total: data.progress.totalEligible,
      });
    }
  }, [data]);

  const baseInked = data?.progress.inked ?? 0;
  const total = data?.progress.totalEligible ?? 0;
  const inkedNow = baseInked + ratedThisSession;
  const slot = sessionSlot(decidedThisSession);
  const progressPct = total > 0 ? Math.min(100, Math.round((inkedNow / total) * 100)) : 0;

  const advance = (decided: number) => {
    const nextDecided = decided + 1;
    setDecidedThisSession(nextDecided);
    if (isSessionCheckpoint(nextDecided)) {
      // Milestone thud at each 10-item checkpoint (firmer than the per-rate tick).
      hapticImpact(ImpactFeedbackStyle.Medium);
      analytics.track('deck_session_completed', {
        session_number: Math.floor(nextDecided / slot.size),
        decided_total: nextDecided,
      });
      setCheckpoint(true);
    }
  };

  const handleRate = async (item: DeckItem, stars: number) => {
    if (!user?.id || busy) return;
    setBusy(true);
    // Optimistic advance — the card already flew off. Success tick confirms the
    // rating committed (matches the import screen's save haptic).
    hapticNotification(NotificationFeedbackType.Success);
    setQueue((q) => q.filter((it) => it.key !== item.key));
    setRatedThisSession((n) => n + 1);
    analytics.track('deck_rating_submitted', {
      stars,
      session_index: slot.index,
      decided_total: decidedThisSession + 1,
    });
    advance(decidedThisSession);
    try {
      await inkStubRating(user.id, item, stars);
    } catch {
      Toast.show({ type: 'error', text1: "Couldn't save that rating", visibilityTime: 2500 });
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async (item: DeckItem) => {
    if (!user?.id || busy) return;
    setBusy(true);
    setQueue((q) => q.filter((it) => it.key !== item.key));
    advance(decidedThisSession);
    try {
      await addSkipped(user.id, item.key);
    } finally {
      setBusy(false);
    }
  };

  const keepGoing = () => {
    hapticImpact();
    setCheckpoint(false);
  };
  const later = () => {
    hapticImpact();
    router.back();
  };

  const top = queue[0];
  const done = !isLoading && !isError && queue.length === 0;

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
        <Text style={styles.close}>✕</Text>
      </Pressable>
      <Text style={styles.headerTitle}>Ink your stubs</Text>
      <View style={{ width: 20 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {header}

      {/* Progress */}
      {total > 0 && (
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>
            {inkedNow} of {total} inked
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
      )}

      <View style={styles.stage}>
        {isLoading && <ActivityIndicator color={colors.tint} />}
        {isError && (
          <View style={styles.centerMsg}>
            <Text style={styles.msgTitle}>Couldn&apos;t load your deck</Text>
            <Pressable style={styles.primaryBtn} onPress={() => refetch()}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {done && (
          <View style={styles.centerMsg}>
            <Text style={styles.msgTitle}>
              {total > 0 ? 'Every stub inked' : 'No blank stubs to ink'}
            </Text>
            <Text style={styles.msgSub}>
              {total > 0
                ? "You've rated your imported library. Skipped any? They'll wait for you here."
                : 'Import from TV Time first, then come back to rate what you brought over.'}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        )}
        {!isLoading && !isError && !done && top && (
          <>
            {/* Backing plates for deck depth (decorative). */}
            <View style={[styles.backing, styles.backing2]} />
            <View style={[styles.backing, styles.backing1]} />
            <DeckCard
              key={top.key}
              item={top}
              reduced={reduced}
              disabled={busy || checkpoint}
              onRate={handleRate}
              onSkip={handleSkip}
            />
          </>
        )}
      </View>

      {!done && !isLoading && (
        <Text style={styles.counter}>
          SAME RATING INPUT AS A REVIEW · SESSION {slot.index} OF {slot.size}
        </Text>
      )}

      {/* Keep-going / later checkpoint */}
      {checkpoint && (
        <View style={styles.checkpointOverlay}>
          <View style={styles.checkpointCard}>
            <Text style={styles.checkpointTitle}>Nice run.</Text>
            <Text style={styles.checkpointSub}>
              {inkedNow} of {total} inked. Keep going, or pick this up later?
            </Text>
            <Pressable style={styles.primaryBtn} onPress={keepGoing}>
              <Text style={styles.primaryBtnText}>Keep going</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={later}>
              <Text style={styles.secondaryBtnText}>Later</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    close: { ...Typography.body.lg, color: colors.textSecondary },
    headerTitle: { ...Typography.body.lg, color: colors.text, fontFamily: Fonts.inter.semibold },
    progressWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    progressText: { ...Typography.body.sm, color: colors.textSecondary, marginBottom: 6 },
    bar: { height: 6, borderRadius: 999, backgroundColor: colors.backgroundSecondary, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 999, backgroundColor: colors.tint },
    stage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    backing: {
      position: 'absolute',
      width: '80%',
      aspectRatio: 2 / 2.5,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      opacity: 0.5,
    },
    backing1: { transform: [{ rotate: '-3deg' }, { scale: 0.97 }] },
    backing2: { transform: [{ rotate: '4deg' }, { scale: 0.94 }], opacity: 0.3 },
    counter: {
      ...Typography.body.xs,
      textAlign: 'center',
      color: colors.textTertiary,
      letterSpacing: 1,
      paddingBottom: Spacing.md,
    },
    centerMsg: { alignItems: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.md },
    msgTitle: { ...Typography.display.h3, color: colors.text, textAlign: 'center' },
    msgSub: { ...Typography.body.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    primaryBtn: {
      backgroundColor: colors.tint,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    primaryBtnText: { ...Typography.button.primary, color: '#fff' },
    secondaryBtn: { paddingVertical: Spacing.sm, alignItems: 'center' },
    secondaryBtnText: { ...Typography.body.sm, color: colors.textSecondary },
    checkpointOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
    },
    checkpointCard: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.sm,
    },
    checkpointTitle: { ...Typography.display.h3, color: colors.text },
    checkpointSub: { ...Typography.body.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
