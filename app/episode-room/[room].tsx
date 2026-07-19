/**
 * Episode Room — per-episode discussion (day-1 cut).
 *
 * The TV Time signature surface, rebuilt as First Takes' sibling: every take
 * here is already scoped to one episode, so the newest take renders as a
 * torn-stub hero and the rest fall to quiet ledger rows, each with an inline
 * comment thread. Reached from the episode row on the show screen, from the
 * post-watch nudge, and from the episode-reminder push (all flag-gated).
 *
 * Locked design calls (Ty, 2026-07-19): feature name "Episode Room"; HARD
 * watched-gate with no peek (no take content is fetched until the viewer has
 * marked the episode watched); no film-grain overlay.
 *
 * Addressed by the compound slug `{tmdbId}-{season}-{episode}` so one route
 * carries all three ids from the route, the push payload, and deep links.
 */

import { useEffect, useMemo, useState } from 'react';
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
import { useEpisodeWatched, useEpisodeRoomTakes } from '@/hooks/use-episode-room';
import {
  parseEpisodeRoomParam,
  episodeRoomSlug,
  formatEpisodeLabel,
  formatEpisodeShort,
  selectHeroTake,
} from '@/lib/episode-room-logic';
import { createFirstTake } from '@/lib/first-take-service';
import type { ReviewVisibility } from '@/lib/database.types';
import { FirstTakeModal } from '@/components/first-take-modal';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { FirstTakesSkeleton, FirstTakesError } from '@/components/first-takes-v2/states';
import { RoomTakeCard } from '@/components/episode-room/room-take-card';
import { RoomEmpty } from '@/components/episode-room/room-empty';
import { WatchedGate } from '@/components/episode-room/watched-gate';

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

  const episode = useMemo(
    () => episodes.find((e) => e.episode_number === coords?.episode),
    [episodes, coords]
  );

  // Prev/next stay within this season and never point past the latest aired
  // episode, so the nav row never lands the viewer in a room for an episode that
  // doesn't exist yet (it disables instead of hiding, keeping the row stable).
  const today = new Date().toISOString().slice(0, 10);
  const maxAired = useMemo(() => {
    const aired = episodes.filter((e) => e.air_date != null && e.air_date <= today);
    return aired.reduce((m, e) => Math.max(m, e.episode_number), 0);
  }, [episodes, today]);

  const handleGoBack = () => {
    if (router.canGoBack()) router.back();
    else if (coords) router.replace(`/tv/${coords.tmdbId}`);
    else router.replace('/');
  };

  const goToEpisode = (episodeNumber: number) => {
    if (!coords) return;
    router.replace(`/episode-room/${episodeRoomSlug(coords.tmdbId, coords.season, episodeNumber)}`);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
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
          <TopBar title="Episode Room" onBack={handleGoBack} colors={colors} styles={styles} />
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
  const prevEnabled = coords.episode > 1;
  const nextEnabled = coords.episode < maxAired;

  const renderStream = () => {
    if (!user) {
      return (
        <View style={styles.signInBox}>
          <Ionicons name="people-outline" size={34} color={colors.textSecondary} />
          <Text style={styles.notFound}>Sign in to join the Episode Room.</Text>
        </View>
      );
    }
    if (watchedLoading) return <FirstTakesSkeleton />;
    if (!isWatched) {
      return (
        <WatchedGate
          episodeLabel={episodeLabel}
          onMarkWatched={() => router.replace(`/tv/${coords.tmdbId}`)}
        />
      );
    }
    if (takesLoading) return <FirstTakesSkeleton />;
    if (takesError) return <FirstTakesError onRetry={refetch} message="We couldn't load this room." />;
    if (takes.length === 0) return <RoomEmpty onCompose={() => setShowComposeModal(true)} />;

    // Hero = highest-engagement take (comment count today), newest as the
    // tie-break; the ledger stays chronological with the hero removed.
    const { hero, rest } = selectHeroTake(
      takes,
      (entry) => entry.take.comment_count ?? 0,
      (entry) => entry.take.created_at
    );
    return (
      <>
        {hero && <RoomTakeCard key={hero.take.id} entry={hero} variant="hero" />}
        {rest.length > 0 && (
          <View style={styles.ledger}>
            {rest.map((entry, index) => (
              <View key={entry.take.id}>
                {index > 0 && <Perforation />}
                <RoomTakeCard entry={entry} variant="ledger" />
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <TopBar
          title={show?.name ?? 'Episode Room'}
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
              onPress={() => prevEnabled && goToEpisode(coords.episode - 1)}
              disabled={!prevEnabled}
              accessibilityRole="button"
              accessibilityLabel="Previous episode room"
              style={[styles.epNavBtn, !prevEnabled && styles.epNavDisabled]}
            >
              <Ionicons name="chevron-back" size={12} color={colors.textTertiary} />
              <Text style={styles.epNavText}>{formatEpisodeShort(coords.season, coords.episode - 1)}</Text>
            </Pressable>
            <Text style={styles.roomLabel}>EPISODE ROOM</Text>
            <Pressable
              onPress={() => nextEnabled && goToEpisode(coords.episode + 1)}
              disabled={!nextEnabled}
              accessibilityRole="button"
              accessibilityLabel="Next episode room"
              style={[styles.epNavBtn, !nextEnabled && styles.epNavDisabled]}
            >
              <Text style={styles.epNavText}>{formatEpisodeShort(coords.season, coords.episode + 1)}</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* Compose — only once the viewer has cleared the watched-gate */}
          {user && isWatched && (
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
              The Room{' '}
              <Text style={styles.sectionCount}>
                · {takes.length} take{takes.length === 1 ? '' : 's'}
              </Text>
            </Text>
          )}

          {renderStream()}
        </ScrollView>
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
  });
}
