/**
 * The blank-stubs rating deck screen (mock frame 7). Loads the eligible-unrated
 * imported items, presents them one card at a time in sessions of ~10, and inks
 * each rating as a QUIET review. Resumes exactly on reopen: rated items drop out
 * of the server read, skipped items persist client-side.
 *
 * Writes are OPTIMISTIC and non-blocking: a decision advances the card
 * immediately and the network write runs in the background, tracked in a bounded
 * in-flight set (keyed per item, so a card can't double-submit). A FAILED write
 * is not re-queued in place — the item simply stays unrated/unskipped
 * server-side, so it returns naturally in the next session's eligibility load.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';
import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import { useTvTimeDeck } from '@/hooks/use-tvtime-deck';
import { inkStubRating } from '@/lib/tvtime-deck/deck-service';
import { addSkipped, clearSkipped } from '@/lib/tvtime-deck/skip-store';
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
  const [deckSize, setDeckSize] = useState(0); // items in the current deck pass (for "N OF M")
  const [ratedThisSession, setRatedThisSession] = useState(0);
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set());
  const [checkpoint, setCheckpoint] = useState(false);
  const seededRef = useRef(false);
  // Bounded in-flight write set, keyed per item — a card can't double-submit and
  // decisions never serialize behind one another (no single busy lock).
  const inFlightRef = useRef<Set<string>>(new Set());
  const decidedRef = useRef(0);

  useEffect(() => {
    if (data && !seededRef.current) {
      seededRef.current = true;
      const initial = buildDeckQueue(data.eligible, data.skippedKeys);
      setQueue(initial);
      setDeckSize(initial.length);
      setSkippedKeys(new Set(data.skippedKeys));
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
  const progressPct = total > 0 ? Math.min(100, Math.round((inkedNow / total) * 100)) : 0;
  // 1-based position of the current card within this deck pass.
  const position = deckSize > 0 ? deckSize - queue.length + 1 : 0;

  // Advance the session counter (drives the 10-item checkpoint). decidedRef keeps
  // an accurate count under rapid optimistic taps (state closures can be stale).
  const advance = () => {
    decidedRef.current += 1;
    const next = decidedRef.current;
    if (isSessionCheckpoint(next)) {
      hapticImpact(ImpactFeedbackStyle.Medium); // milestone thud, firmer than the per-rate tick
      analytics.track('deck_session_completed', {
        session_number: Math.floor(next / sessionSlot(next).size),
        decided_total: next,
      });
      setCheckpoint(true);
    }
  };

  const handleRate = (item: DeckItem, rating: number) => {
    if (!user?.id || checkpoint) return;
    if (inFlightRef.current.has(item.key)) return;
    hapticNotification(NotificationFeedbackType.Success); // confirms the rating committed
    setQueue((q) => q.filter((it) => it.key !== item.key));
    setRatedThisSession((n) => n + 1);
    analytics.track('deck_rating_submitted', {
      rating,
      session_index: sessionSlot(decidedRef.current).index,
      decided_total: decidedRef.current + 1,
    });
    advance();
    inFlightRef.current.add(item.key);
    inkStubRating(user.id, item, rating)
      .catch((err) => {
        // Failed write: the item stays unrated server-side and returns next
        // session — no in-place re-queue. Tell the user it didn't stick AND
        // report the cause — a swallowed write error is exactly why #722 (every
        // fractional rating failing a 22P02 integer coercion) stayed invisible.
        captureException(err instanceof Error ? err : new Error(String(err)), {
          context: 'tvtime-deck-ink-rating',
          item_key: item.key,
          rating,
        });
        Toast.show({ type: 'error', text1: "Couldn't save that rating", visibilityTime: 2500 });
      })
      .finally(() => inFlightRef.current.delete(item.key));
  };

  const handleSkip = (item: DeckItem) => {
    if (!user?.id || checkpoint) return;
    if (inFlightRef.current.has(item.key)) return;
    setQueue((q) => q.filter((it) => it.key !== item.key));
    setSkippedKeys((s) => new Set(s).add(item.key));
    advance();
    inFlightRef.current.add(item.key);
    addSkipped(user.id, item.key)
      .finally(() => inFlightRef.current.delete(item.key));
  };

  const keepGoing = () => {
    hapticImpact();
    setCheckpoint(false);
  };
  const later = () => {
    hapticImpact();
    router.back();
  };

  // Founder spec: skipped items are re-surfaceable. Rebuild the deck from the
  // still-eligible skipped items (they were never rated, so they're still in
  // data.eligible) and clear the persisted skip set.
  const revisitSkipped = () => {
    if (!user?.id || !data) return;
    hapticImpact();
    const revisit = data.eligible.filter((it) => skippedKeys.has(it.key));
    setQueue(revisit);
    setDeckSize(revisit.length);
    setSkippedKeys(new Set());
    clearSkipped(user.id);
  };

  const top = queue[0];
  const done = !isLoading && !isError && queue.length === 0;
  const skippedCount = skippedKeys.size;

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
        <Ionicons name="close" size={26} color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.headerTitle}>Ink your stubs</Text>
      <View style={{ width: 26 }} />
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
                ? skippedCount > 0
                  ? `You've rated the rest of your imported library. ${skippedCount} skipped ${skippedCount === 1 ? 'stub is' : 'stubs are'} still waiting whenever you want them.`
                  : "You've rated your imported library."
                : 'Import from TV Time first, then come back to rate what you brought over.'}
            </Text>
            {total > 0 && skippedCount > 0 && (
              <Pressable style={styles.primaryBtn} onPress={revisitSkipped}>
                <Text style={styles.primaryBtnText}>Revisit skipped ({skippedCount})</Text>
              </Pressable>
            )}
            <Pressable
              style={total > 0 && skippedCount > 0 ? styles.secondaryBtn : styles.primaryBtn}
              onPress={() => router.back()}
            >
              <Text style={total > 0 && skippedCount > 0 ? styles.secondaryBtnText : styles.primaryBtnText}>
                Done
              </Text>
            </Pressable>
          </View>
        )}
        {!isLoading && !isError && !done && top && (
          <DeckCard
            key={top.key}
            item={top}
            reduced={reduced}
            disabled={checkpoint}
            onRate={handleRate}
            onSkip={handleSkip}
          />
        )}
      </View>

      {!done && !isLoading && !isError && deckSize > 0 && (
        <Text style={styles.counter}>
          {position} OF {deckSize}
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
    counter: {
      ...Typography.body.xs,
      textAlign: 'center',
      color: colors.textTertiary,
      letterSpacing: 1.5,
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
    secondaryBtn: { paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.xs },
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
      // Web: keep this "keep going?" modal card from spanning the full viewport
      // (~1400px edge-to-edge). Centered by checkpointOverlay's alignItems.
      ...(Platform.OS === 'web' ? { maxWidth: 440 } : {}),
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
