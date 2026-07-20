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
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { inkStubRating } from '@/lib/tvtime-deck/deck-service';
import { addSkipped, clearSkipped } from '@/lib/tvtime-deck/skip-store';
import {
  buildDeckQueue,
  sessionSlot,
  isSessionCheckpoint,
  shouldOfferTakeBridge,
  type DeckItem,
} from '@/lib/tvtime-deck/deck-logic';
import { createFirstTake } from '@/lib/first-take-service';
import type { ReviewVisibility } from '@/lib/database.types';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { FirstTakeModal } from '@/components/first-take-modal';
import { DeckCard } from './deck-card';
import { InkTakeBridgeStrip } from './ink-take-bridge-strip';

/** How long the ink→take invitation lingers before it slips away on its own. */
const BRIDGE_AUTO_DISMISS_MS = 7000;

/** A just-inked item plus the rating chosen, carried into the take composer. */
type BridgeOffer = { item: DeckItem; rating: number };

export function TvTimeDeckScreen() {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);
  const reduced = useReducedMotion();
  const { preferences } = useUserPreferences();

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

  // Ink→take bridge: the just-inked item the invitation strip is offering (null
  // when nothing to offer), the frozen target while the composer is open, and
  // whether that post is in flight. Each offer carries the rating just inked so
  // the composer opens pre-filled with it. Keys the user already has a take on
  // live in takeKeysRef so the bridge is cheaply suppressed for spoken-for titles.
  const [bridgeOffer, setBridgeOffer] = useState<BridgeOffer | null>(null);
  const [takeTarget, setTakeTarget] = useState<BridgeOffer | null>(null);
  const [isPostingTake, setIsPostingTake] = useState(false);
  const takeKeysRef = useRef<Set<string>>(new Set());
  const bridgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBridgeTimer = () => {
    if (bridgeTimerRef.current) {
      clearTimeout(bridgeTimerRef.current);
      bridgeTimerRef.current = null;
    }
  };
  // Tear the auto-dismiss timer down on unmount so it can't fire into a gone tree.
  useEffect(() => clearBridgeTimer, []);

  useEffect(() => {
    if (data && !seededRef.current) {
      seededRef.current = true;
      const initial = buildDeckQueue(data.eligible, data.skippedKeys);
      setQueue(initial);
      setDeckSize(initial.length);
      setSkippedKeys(new Set(data.skippedKeys));
      takeKeysRef.current = new Set(data.existingTakeKeys);
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
    // Ink→take bridge: the ink itself stays a quiet private review (untouched
    // above). Separately, offer ONE optional public First Take for this title,
    // rating carried over — unless the user already has a take for it. The deck
    // has ALREADY advanced, so a pure inker never feels this.
    if (shouldOfferTakeBridge(item.key, takeKeysRef.current)) {
      clearBridgeTimer();
      setBridgeOffer({ item, rating });
      analytics.track('deck_take_bridge_shown', { media_type: item.target.mediaType });
      bridgeTimerRef.current = setTimeout(() => {
        setBridgeOffer((cur) => (cur?.item.key === item.key ? null : cur));
      }, BRIDGE_AUTO_DISMISS_MS);
    }
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

  // Ink→take bridge: tapping the invitation freezes its item+rating as the
  // composer target and opens the modal (the deck stays where it is behind it).
  const openTakeComposer = (item: DeckItem) => {
    clearBridgeTimer();
    if (bridgeOffer && bridgeOffer.item.key === item.key) {
      setTakeTarget(bridgeOffer);
    }
    setBridgeOffer(null);
    analytics.track('deck_take_bridge_tapped', { media_type: item.target.mediaType });
  };

  const dismissBridge = (item: DeckItem) => {
    clearBridgeTimer();
    setBridgeOffer((cur) => (cur?.item.key === item.key ? null : cur));
    analytics.track('deck_take_bridge_dismissed', { media_type: item.target.mediaType });
  };

  // Post the optional First Take. This is a NORMAL organic take (public-default,
  // visibility picker in the modal) — it SHOULD hit the feed/notifications like
  // any take. It does NOT touch the quiet-ink review. Rethrows so the modal
  // skips its "posted!" confirmation on failure; the duplicate path is only a
  // fallback (the bridge already dedupes eligible titles).
  const handleTakeSubmit = async (data: {
    rating: number | null;
    quoteText: string;
    isSpoiler: boolean;
    visibility: ReviewVisibility;
  }) => {
    const item = takeTarget?.item;
    if (!user?.id || !item) return;
    setIsPostingTake(true);
    try {
      await createFirstTake(user.id, {
        tmdbId: item.target.tmdbId,
        movieTitle: item.title,
        posterPath: item.posterPath,
        reactionEmoji: '',
        quoteText: data.quoteText,
        isSpoiler: data.isSpoiler,
        rating: data.rating,
        visibility: data.visibility,
        mediaType: item.target.mediaType,
        showName: item.target.mediaType === 'tv_show' ? item.title : null,
      });
      takeKeysRef.current.add(item.key);
      analytics.track('deck_take_posted', {
        media_type: item.target.mediaType,
        rating: data.rating,
        has_quote: data.quoteText.trim().length > 0,
      });
      setTakeTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'DUPLICATE_FIRST_TAKE') {
        // Already spoken for (raced another surface) — treat as done, don't nag.
        takeKeysRef.current.add(item.key);
        setTakeTarget(null);
        Toast.show({ type: 'info', text1: 'You already have a take for this', visibilityTime: 2500 });
      } else {
        Toast.show({ type: 'error', text1: "Couldn't post your take", visibilityTime: 2500 });
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      setIsPostingTake(false);
    }
  };

  const top = queue[0];
  const done = !isLoading && !isError && queue.length === 0;
  const skippedCount = skippedKeys.size;
  const bridgePosterUrl = takeTarget ? getTMDBImageUrl(takeTarget.item.posterPath, 'w342') : null;

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

      {/* Ink→take bridge: optional "say a line about it" invitation after an ink.
          Non-blocking — the deck already advanced; hidden during the checkpoint. */}
      {bridgeOffer && !checkpoint && (
        <View style={styles.bridgeWrap}>
          <InkTakeBridgeStrip
            key={bridgeOffer.item.key}
            item={bridgeOffer.item}
            reduced={reduced}
            onTap={openTakeComposer}
            onDismiss={dismissBridge}
          />
        </View>
      )}

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

      {/* Ink→take composer. A NORMAL organic First Take (public-default visibility
          picker), pre-filled with the rating just inked. isEditing={false} keeps
          CREATE copy ("Your First Take" / "Post First Take") even though we seed
          initialValues — the quiet-ink review it rides on is left untouched. */}
      <FirstTakeModal
        visible={!!takeTarget}
        onClose={() => setTakeTarget(null)}
        onSubmit={handleTakeSubmit}
        movieTitle={takeTarget?.item.title ?? ''}
        moviePosterUrl={bridgePosterUrl ?? undefined}
        isSubmitting={isPostingTake}
        isEditing={false}
        initialValues={
          takeTarget
            ? {
                rating: takeTarget.rating,
                quoteText: '',
                isSpoiler: false,
                visibility: preferences?.reviewVisibility ?? 'public',
              }
            : null
        }
      />
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
    // The invitation floats over the bottom of the deck so it never shifts the
    // card when it arrives or auto-dismisses (fixed inset — no % on iOS new-arch).
    bridgeWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: Spacing.xxl,
      alignItems: 'center',
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
