/**
 * Episode Room — per-episode discussion (day-1 cut).
 *
 * The TV Time signature surface, rebuilt as First Takes' sibling: every take
 * here is already scoped to one episode. The most popular take renders as a
 * torn-stub hero, the next-most-popular fall to a capped ledger, and the full
 * list lives behind "View all takes". Tapping any take opens its detail page
 * (deep comment threads live there, not inline). Reached from the episode row
 * on the show screen, from the post-watch nudge, from the home continue-watching
 * card, and from the episode-reminder push (all flag-gated).
 *
 * Locked design calls (Ty, 2026-07-19): HARD watched-gate with no peek (no
 * take content is fetched until the viewer has marked the episode watched);
 * no film-grain overlay. Renamed "Episode Room" → "Debrief Room" (Ty,
 * 2026-07-20) — user-facing copy only; the flag (`episode_rooms`), routes
 * (`/episode-room/*`), and code identifiers deliberately keep the old name.
 *
 * Addressed by the compound slug `{tmdbId}-{season}-{episode}` so one route
 * carries all three ids from the route, the push payload, and deep links.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { useAuth } from '@/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useTvShowDetail } from '@/hooks/use-tv-show-detail';
import { useSeasonEpisodes } from '@/hooks/use-season-episodes';
import { useEpisodeRoomsGate } from '@/hooks/use-episode-rooms-enabled';
import {
  useEpisodeWatched,
  useEpisodeRoomTakes,
  useUserEpisodeTake,
  useUnlockEpisodeRoom,
  episodeRoomWatchedKey,
} from '@/hooks/use-episode-room';
import {
  parseEpisodeRoomParam,
  episodeRoomSlug,
  formatEpisodeLabel,
  formatEpisodeShort,
  selectHeroTake,
  sortTakesByEngagement,
  resolveNextUpEpisode,
  resolvePrevEpisode,
  localDateString,
  ROOM_LEDGER_CAP,
} from '@/lib/episode-room-logic';
import { createFirstTake } from '@/lib/first-take-service';
import type { ReviewVisibility } from '@/lib/database.types';
import { FirstTakeModal } from '@/components/first-take-modal';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { FirstTakesSkeleton, FirstTakesError } from '@/components/first-takes-v2/states';
import { RoomTakeCard } from '@/components/episode-room/room-take-card';
import { RoomEmpty } from '@/components/episode-room/room-empty';
import { WatchedGate } from '@/components/episode-room/watched-gate';
import { SeasonInterstitial } from '@/components/episode-room/season-interstitial';

/** Rapid prev/next taps within this window are ignored (ref-based, no render). */
const NAV_THROTTLE_MS = 350;

export default function EpisodeRoomScreen() {
  const router = useRouter();
  const { room } = useLocalSearchParams<{ room: string }>();
  const coords = useMemo(() => parseEpisodeRoomParam(room), [room]);

  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dashColor = effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { enabled, resolved } = useEpisodeRoomsGate();

  const [showComposeModal, setShowComposeModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Non-null while the season-crossing stamp plays; the interstitial clears it.
  const [interstitialSeason, setInterstitialSeason] = useState<number | null>(null);
  const clearInterstitial = useCallback(() => setInterstitialSeason(null), []);
  // Rapid prev/next tap guard — a ref so it never triggers a render.
  const lastNavRef = useRef(0);
  // Unlock-in-place (Ty, 07-19): true from "mark succeeded" until the gate's
  // unlock animation finishes — only then does the watched probe flip, so the
  // veil plays out instead of being yanked on refetch.
  const [gateUnlocking, setGateUnlocking] = useState(false);
  // Prev/next reuses this screen instance — an in-flight unlock must not
  // follow the user to a different episode's gate.
  const roomRef = useRef(room);
  roomRef.current = room;
  useEffect(() => {
    setGateUnlocking(false);
  }, [room]);

  // Flag off = invisible. A stale push / deep link when the flag is off bounces
  // back to the show detail (its prior destination), so the room never surfaces.
  // The redirect waits on ACTUAL flag resolution (not a fixed timer), so a
  // flag-ON user is never falsely bounced on a cold start where PostHog resolves
  // flags slowly.
  useEffect(() => {
    if (resolved && !enabled && coords) {
      router.replace(`/tv/${coords.tmdbId}`);
    }
  }, [resolved, enabled, coords, router]);

  const { show } = useTvShowDetail({ showId: coords?.tmdbId ?? 0, enabled: !!coords });
  const { episodes } = useSeasonEpisodes({
    showId: coords?.tmdbId ?? 0,
    seasonNumber: coords?.season ?? 0,
    enabled: !!coords,
  });

  const { data: watchedData, isLoading: watchedLoading } = useEpisodeWatched(
    coords?.tmdbId ?? 0,
    coords?.season ?? 0,
    coords?.episode ?? 0
  );
  const isWatched = watchedData === true;

  const {
    takes,
    isLoading: takesLoading,
    isError: takesError,
    refetch,
  } = useEpisodeRoomTakes(
    coords?.tmdbId ?? 0,
    coords?.season ?? 0,
    coords?.episode ?? 0,
    isWatched
  );

  // Does this user already have a take here (any visibility)? Gates the compose
  // affordances so they can't be handed a blank composer that would dead-end on
  // the per-episode unique index.
  const { data: hasOwnTake } = useUserEpisodeTake(
    coords?.tmdbId ?? 0,
    coords?.season ?? 0,
    coords?.episode ?? 0
  );

  const unlockMutation = useUnlockEpisodeRoom(coords?.tmdbId ?? 0);

  const handleMarkWatched = async () => {
    if (!coords) return;
    // Episode metadata is required by the mark RPC path; if TMDB data hasn't
    // loaded (rare — offline/deep-link race), fall back to the show screen.
    if (!episode) {
      router.replace(`/tv/${coords.tmdbId}`);
      return;
    }
    const startedRoom = room;
    try {
      await unlockMutation.mutateAsync({
        // Detail carries every TMDBTvShow field except popularity.
        show: show ? { ...show, popularity: 0 } : null,
        episode,
        totalEpisodesInSeason: episodes.length,
      });
      // The mark can resolve after a prev/next hop — never unlock a gate the
      // user has already left. (The probe invalidation still unlocks the
      // marked episode's room on their next visit.)
      if (roomRef.current !== startedRoom) return;
      setGateUnlocking(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      Toast.show({
        type: 'error',
        text1:
          message === 'Episode has not aired yet'
            ? 'This episode has not aired yet'
            : 'Could not mark it watched',
        visibilityTime: 3000,
      });
    }
  };

  const handleGateUnlocked = () => {
    if (!coords) return;
    // Flip the probe in place — the takes query enables on the next render,
    // with no gate flash while a refetch settles.
    queryClient.setQueryData(episodeRoomWatchedKey(user?.id, coords.tmdbId, coords.season, coords.episode), true);
    setGateUnlocking(false);
  };

  const episode = useMemo(
    () => episodes.find((e) => e.episode_number === coords?.episode),
    [episodes, coords]
  );

  // Prev/next never point past the latest aired episode — but at a season edge
  // they cross into the adjacent season (finale → next premiere, S>=2 E1 → the
  // prior season's last aired episode) instead of dead-ending. The adjacent
  // season's episode catalog is fetched ONLY at the boundary, and only when the
  // show actually has that season, so mid-season rooms pull nothing extra.
  const today = localDateString();
  const currentAired = useMemo(
    () => episodes.map((e) => ({ episodeNumber: e.episode_number, airDate: e.air_date })),
    [episodes]
  );

  const showHasSeason = useCallback(
    (seasonNumber: number) =>
      seasonNumber >= 1 &&
      (show?.seasons?.some((s) => s.season_number === seasonNumber && s.episode_count > 0) ?? false),
    [show]
  );

  const atNextSeasonBoundary =
    !!coords &&
    episodes.length > 0 &&
    !episodes.some((e) => e.episode_number === coords.episode + 1) &&
    showHasSeason(coords.season + 1);
  const atPrevSeasonBoundary =
    !!coords && coords.episode === 1 && showHasSeason((coords?.season ?? 0) - 1);

  const { episodes: nextSeasonEpisodes } = useSeasonEpisodes({
    showId: coords?.tmdbId ?? 0,
    seasonNumber: (coords?.season ?? 0) + 1,
    enabled: atNextSeasonBoundary,
  });
  const { episodes: prevSeasonEpisodes } = useSeasonEpisodes({
    showId: coords?.tmdbId ?? 0,
    seasonNumber: (coords?.season ?? 0) - 1,
    enabled: atPrevSeasonBoundary,
  });

  const nextTarget = useMemo(() => {
    if (!coords) return null;
    return resolveNextUpEpisode({
      season: coords.season,
      episode: coords.episode,
      currentSeasonEpisodes: episodes.length > 0 ? currentAired : null,
      nextSeasonEpisodes:
        atNextSeasonBoundary && nextSeasonEpisodes.length > 0
          ? nextSeasonEpisodes.map((e) => ({ episodeNumber: e.episode_number, airDate: e.air_date }))
          : null,
      today,
    });
  }, [coords, episodes.length, currentAired, atNextSeasonBoundary, nextSeasonEpisodes, today]);

  const prevTarget = useMemo(() => {
    if (!coords) return null;
    return resolvePrevEpisode({
      season: coords.season,
      episode: coords.episode,
      prevSeasonEpisodes:
        atPrevSeasonBoundary && prevSeasonEpisodes.length > 0
          ? prevSeasonEpisodes.map((e) => ({ episodeNumber: e.episode_number, airDate: e.air_date }))
          : null,
      today,
    });
  }, [coords, atPrevSeasonBoundary, prevSeasonEpisodes, today]);

  const handleGoBack = () => {
    if (router.canGoBack()) router.back();
    else if (coords) router.replace(`/tv/${coords.tmdbId}`);
    else router.replace('/');
  };

  // Nav to an explicit (season, episode). Ref-based throttle swallows rapid
  // taps (and repeat crossings) without a render; a genuine season change fires
  // the interstitial before the replace so the stamp plays as the new room lands.
  const goToEpisode = (season: number, episodeNumber: number) => {
    if (!coords) return;
    const now = Date.now();
    if (now - lastNavRef.current < NAV_THROTTLE_MS) return;
    lastNavRef.current = now;
    if (season !== coords.season) setInterstitialSeason(season);
    router.replace(`/episode-room/${episodeRoomSlug(coords.tmdbId, season, episodeNumber)}`);
  };

  const handleComposeSubmit = async (data: {
    rating: number | null;
    quoteText: string;
    isSpoiler: boolean;
    visibility: ReviewVisibility;
  }) => {
    if (!user || !coords) return;
    setIsSubmitting(true);
    try {
      await createFirstTake(user.id, {
        tmdbId: coords.tmdbId,
        movieTitle: show?.name ?? '',
        posterPath: show?.poster_path ?? null,
        reactionEmoji: '',
        quoteText: data.quoteText,
        isSpoiler: data.isSpoiler,
        rating: data.rating,
        visibility: data.visibility,
        mediaType: 'tv_episode',
        seasonNumber: coords.season,
        episodeNumber: coords.episode,
        showName: show?.name ?? null,
      });
      setShowComposeModal(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['first-takes', user.id] });
      queryClient.invalidateQueries({
        queryKey: ['episode-room-own-take', user.id, coords.tmdbId, coords.season, coords.episode],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      // Close the modal so the user is never stranded on a failed post, and
      // surface the reason. DUPLICATE is the backstop for the race where the
      // own-take gate was stale (e.g. a take posted from another device).
      setShowComposeModal(false);
      Toast.show({
        type: 'error',
        text1:
          message === 'DUPLICATE_FIRST_TAKE'
            ? 'You already tore off a take for this episode'
            : 'Failed to post your take',
        visibilityTime: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Malformed slug — nothing to show.
  if (!coords) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <TopBar title="Debrief Room" onBack={handleGoBack} colors={colors} styles={styles} />
          <View style={styles.centered}>
            <Text style={styles.notFound}>This room could not be opened.</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Flag resolving / off (redirect in flight) — hold on a spinner.
  if (!enabled) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        </SafeAreaView>
      </>
    );
  }

  const episodeLabel = formatEpisodeLabel(coords.season, coords.episode);
  const posterUri = show?.poster_path ? getTMDBImageUrl(show.poster_path, 'w185') ?? undefined : undefined;
  const airDate = episode?.air_date ?? null;
  const prevEnabled = prevTarget != null;
  const nextEnabled = nextTarget != null;

  const renderStream = () => {
    if (!user) {
      return (
        <View style={styles.signInBox}>
          <Ionicons name="people-outline" size={34} color={colors.textSecondary} />
          <Text style={styles.notFound}>Sign in to join the Debrief Room.</Text>
        </View>
      );
    }
    if (watchedLoading) return <FirstTakesSkeleton />;
    if (!isWatched) {
      return (
        // Keyed by episode (the #662 lesson): prev/next reuses this screen
        // instance, and an unkeyed gate would carry unlock animation state —
        // and a stale onUnlocked — across episodes.
        <WatchedGate
          key={`${coords.tmdbId}-${coords.season}-${coords.episode}`}
          episodeLabel={episodeLabel}
          onMarkWatched={handleMarkWatched}
          pending={unlockMutation.isPending}
          unlocking={gateUnlocking}
          onUnlocked={handleGateUnlocked}
        />
      );
    }
    if (takesLoading) return <FirstTakesSkeleton />;
    if (takesError) return <FirstTakesError onRetry={refetch} message="We couldn't load this room." />;
    if (takes.length === 0) {
      // The user's own take can be non-public (excluded from the public stream),
      // so an "empty" room where they already posted must NOT offer a composer
      // that would dup-fail — show a quiet in-room note instead.
      return hasOwnTake ? (
        <View style={styles.inRoomNote}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.inRoomText}>You&rsquo;re in this room — your take is posted.</Text>
        </View>
      ) : (
        <RoomEmpty onCompose={() => setShowComposeModal(true)} />
      );
    }

    // Hero = highest-engagement take (comment count today), newest as the
    // tie-break. The ledger below is ALSO popularity-ordered and capped — the
    // room shows the top of the conversation, not an endless scroll; the full
    // list lives behind "View all takes" (Ty, 2026-07-19).
    const engagement = (entry: (typeof takes)[number]) => entry.take.comment_count ?? 0;
    const createdAt = (entry: (typeof takes)[number]) => entry.take.created_at;
    const { hero, rest } = selectHeroTake(takes, engagement, createdAt);
    const ledger = sortTakesByEngagement(rest, engagement, createdAt).slice(0, ROOM_LEDGER_CAP);
    const overflow = rest.length - ledger.length;
    return (
      <>
        {hero && (
          <RoomTakeCard
            key={hero.take.id}
            entry={hero}
            variant="hero"
            onPress={() => router.push(`/first-take/${hero.take.id}`)}
          />
        )}
        {ledger.length > 0 && (
          <View style={styles.ledger}>
            {ledger.map((entry, index) => (
              <View key={entry.take.id}>
                {index > 0 && <Perforation />}
                <RoomTakeCard
                  entry={entry}
                  variant="ledger"
                  onPress={() => router.push(`/first-take/${entry.take.id}`)}
                />
              </View>
            ))}
          </View>
        )}
        {overflow > 0 && (
          <Pressable
            onPress={() =>
              router.push(`/episode-room/${episodeRoomSlug(coords.tmdbId, coords.season, coords.episode)}/all`)
            }
            accessibilityRole="button"
            accessibilityLabel="View all takes for this episode"
            style={({ pressed }) => [styles.viewAll, { borderColor: dashColor, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>
              View all {takes.length} takes for this episode
            </Text>
            <Ionicons name="arrow-forward" size={13} color={colors.textTertiary} />
          </Pressable>
        )}
      </>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <TopBar
          title={show?.name ?? 'Debrief Room'}
          onBack={handleGoBack}
          colors={colors}
          styles={styles}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Episode identity */}
          <View style={styles.episodeId}>
            {posterUri ? (
              <Image source={{ uri: posterUri }} style={styles.posterThumb} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.posterThumb, styles.posterPlaceholder]}>
                <Ionicons name="tv-outline" size={20} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.episodeCopy}>
              <View style={styles.epChip}>
                <Text style={styles.epChipText}>{episodeLabel}</Text>
              </View>
              <Text style={styles.epTitle} numberOfLines={2}>
                {episode?.name ?? 'Episode'}
              </Text>
              {airDate && <Text style={styles.epSub}>Aired {airDate}</Text>}
            </View>
          </View>

          {/* Episode nav — quiet, disables (not hides) at the season edges */}
          <View style={styles.epNav}>
            <Pressable
              onPress={() => prevTarget && goToEpisode(prevTarget.season, prevTarget.episode)}
              disabled={!prevEnabled}
              accessibilityRole="button"
              accessibilityLabel="Previous episode's Debrief Room"
              style={[styles.epNavBtn, !prevEnabled && styles.epNavDisabled]}
            >
              <Ionicons name="chevron-back" size={12} color={colors.textTertiary} />
              {/* Only label a target that exists — a disabled prev at S1E1 must
                  not advertise a room. At a season edge the label shows the
                  cross-season target (e.g. "S3E10"). */}
              {prevTarget && (
                <Text style={styles.epNavText}>{formatEpisodeShort(prevTarget.season, prevTarget.episode)}</Text>
              )}
            </Pressable>
            <Text style={styles.roomLabel}>DEBRIEF ROOM</Text>
            <Pressable
              onPress={() => nextTarget && goToEpisode(nextTarget.season, nextTarget.episode)}
              disabled={!nextEnabled}
              accessibilityRole="button"
              accessibilityLabel="Next episode's Debrief Room"
              style={[styles.epNavBtn, !nextEnabled && styles.epNavDisabled]}
            >
              {nextTarget && (
                <Text style={styles.epNavText}>{formatEpisodeShort(nextTarget.season, nextTarget.episode)}</Text>
              )}
              <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* Compose — only once the viewer has cleared the watched-gate, and
              only when they don't already have a take here (else the composer
              would dead-end on the per-episode unique index). */}
          {user && isWatched && !hasOwnTake && (
            <Pressable
              onPress={() => setShowComposeModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Tear off a take"
              style={({ pressed }) => [styles.compose, { borderColor: dashColor, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.composeMark, { color: colors.tint }]}>&ldquo;</Text>
              <View style={styles.composeCopy}>
                <Text style={[styles.composeEyebrow, { color: colors.tint }]}>TEAR OFF A TAKE</Text>
                <Text style={[styles.composePlaceholder, { color: colors.textSecondary }]}>
                  What did you think of this one?
                </Text>
              </View>
              <Ionicons name="pencil-outline" size={16} color={colors.textTertiary} />
            </Pressable>
          )}

          {/* Section label */}
          {user && isWatched && (
            <Text style={styles.sectionLabel}>
              The Debrief{' '}
              <Text style={styles.sectionCount}>
                · {takes.length} take{takes.length === 1 ? '' : 's'}
              </Text>
            </Text>
          )}

          {renderStream()}
        </ScrollView>
        <SeasonInterstitial season={interstitialSeason} onDone={clearInterstitial} />
      </SafeAreaView>

      <FirstTakeModal
        visible={showComposeModal}
        onClose={() => setShowComposeModal(false)}
        onSubmit={handleComposeSubmit}
        movieTitle={show?.name ? `${show.name} · ${episodeLabel}` : episodeLabel}
        moviePosterUrl={posterUri}
        isSubmitting={isSubmitting}
        seasonNumber={coords.season}
        episodeNumber={coords.episode}
      />
    </>
  );
}

function TopBar({
  title,
  onBack,
  colors,
  styles,
}: {
  title: string;
  onBack: () => void;
  colors: typeof Colors.dark;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={styles.topBarTitle} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingBottom: Spacing.xxl,
      ...(Platform.OS === 'web' ? { maxWidth: 768, width: '100%', alignSelf: 'center' as const } : {}),
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    signInBox: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 48,
    },
    notFound: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 48,
      paddingHorizontal: Spacing.md,
    },
    topBarTitle: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: colors.textTertiary,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: 8,
    },
    episodeId: {
      flexDirection: 'row',
      gap: 12,
      paddingTop: 8,
      paddingHorizontal: 4,
      alignItems: 'flex-start',
    },
    posterThumb: {
      width: 56,
      height: 84,
      borderRadius: 6,
    },
    posterPlaceholder: {
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    episodeCopy: {
      flex: 1,
      minWidth: 0,
    },
    epChip: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      marginBottom: 8,
    },
    epChipText: {
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.textSecondary,
    },
    epTitle: {
      fontSize: 21,
      fontWeight: '800',
      lineHeight: 24,
      letterSpacing: -0.2,
      color: colors.text,
      marginBottom: 8,
    },
    epSub: {
      fontSize: 10.5,
      letterSpacing: 0.4,
      color: colors.textTertiary,
      textTransform: 'uppercase',
    },
    epNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingTop: 14,
    },
    epNavBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingVertical: 4,
    },
    epNavDisabled: {
      opacity: 0.35,
    },
    epNavText: {
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.textTertiary,
    },
    roomLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 2,
      color: colors.textTertiary,
      opacity: 0.55,
    },
    compose: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    composeMark: {
      fontSize: 26,
      lineHeight: 26,
      fontWeight: '800',
    },
    composeCopy: {
      flex: 1,
      minWidth: 0,
    },
    composeEyebrow: {
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 1.4,
      marginBottom: 3,
    },
    composePlaceholder: {
      fontSize: 13.5,
    },
    sectionLabel: {
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      fontWeight: '700',
      color: colors.textTertiary,
      marginTop: 20,
      marginBottom: 10,
      marginHorizontal: 2,
    },
    sectionCount: {
      fontWeight: '500',
      opacity: 0.7,
    },
    ledger: {
      marginTop: 4,
    },
    viewAll: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginTop: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 12,
      paddingVertical: 11,
    },
    viewAllText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    inRoomNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 24,
      paddingHorizontal: 16,
    },
    inRoomText: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
