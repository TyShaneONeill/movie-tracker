/**
 * Episode Room — all takes. The full popularity-ordered list behind the room's
 * "View all takes" affordance; the room itself stays capped (hero + a few).
 *
 * Same guards as the room, because this screen is independently deep-linkable:
 * flag off → redirect to the show detail; HARD watched-gate before any take
 * content is fetched; blocked users filtered from the stream (the shared hook
 * does both fetch-gating and block-filtering).
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useEpisodeRoomsGate } from '@/hooks/use-episode-rooms-enabled';
import { useEpisodeWatched, useEpisodeRoomTakes } from '@/hooks/use-episode-room';
import type { EpisodeRoomTake } from '@/hooks/use-episode-room';
import {
  parseEpisodeRoomParam,
  formatEpisodeLabel,
  sortTakesByEngagement,
} from '@/lib/episode-room-logic';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { FirstTakesSkeleton, FirstTakesError } from '@/components/first-takes-v2/states';
import { RoomTakeCard } from '@/components/episode-room/room-take-card';
import { WatchedGate } from '@/components/episode-room/watched-gate';

export default function EpisodeRoomAllTakesScreen() {
  const router = useRouter();
  const { room } = useLocalSearchParams<{ room: string }>();
  const coords = useMemo(() => parseEpisodeRoomParam(room), [room]);

  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { enabled, resolved } = useEpisodeRoomsGate();

  useEffect(() => {
    if (resolved && !enabled && coords) {
      router.replace(`/tv/${coords.tmdbId}`);
    }
  }, [resolved, enabled, coords, router]);

  const { data: watchedData, isLoading: watchedLoading } = useEpisodeWatched(
    coords?.tmdbId ?? 0,
    coords?.season ?? 0,
    coords?.episode ?? 0
  );
  const isWatched = watchedData === true;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const { takes, isLoading, isError, refetch } = useEpisodeRoomTakes(
    coords?.tmdbId ?? 0,
    coords?.season ?? 0,
    coords?.episode ?? 0,
    isWatched
  );

  const ordered = useMemo(
    () =>
      sortTakesByEngagement(
        takes,
        (entry) => entry.take.comment_count ?? 0,
        (entry) => entry.take.created_at
      ),
    [takes]
  );

  const handleGoBack = () => {
    if (router.canGoBack()) router.back();
    else if (coords) router.replace(`/episode-room/${room}`);
    else router.replace('/');
  };

  if (!coords) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.centered}>
            <Text style={styles.muted}>This room could not be opened.</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

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

  const renderBody = () => {
    if (!user) {
      return (
        <View style={styles.centered}>
          <Text style={styles.muted}>Sign in to join the Debrief Room.</Text>
        </View>
      );
    }
    if (watchedLoading) return <FirstTakesSkeleton />;
    if (!isWatched) {
      return (
        <View style={styles.gateWrap}>
          {/* The unlock-in-place flow lives on the room screen — send the rare
              gated deep-link visitor there rather than duplicating it here. */}
          <WatchedGate
            episodeLabel={episodeLabel}
            onMarkWatched={() => router.replace(`/episode-room/${room}`)}
          />
        </View>
      );
    }
    if (isLoading) return <FirstTakesSkeleton />;
    if (isError) return <FirstTakesError onRetry={refetch} message="We couldn't load these takes." />;

    return (
      <FlatList
        data={ordered}
        keyExtractor={(entry: EpisodeRoomTake) => entry.take.id}
        renderItem={({ item }) => (
          <RoomTakeCard
            entry={item}
            variant="ledger"
            onPress={() => router.push(`/first-take/${item.take.id}`)}
          />
        )}
        ItemSeparatorComponent={Perforation}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              setIsRefreshing(true);
              try {
                await refetch();
              } finally {
                setIsRefreshing(false);
              }
            }}
            tintColor={colors.tint}
            colors={[colors.tint]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.muted}>No takes in this room yet.</Text>
          </View>
        }
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={handleGoBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <View style={styles.topBarCopy}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              ALL TAKES
            </Text>
            <Text style={styles.topBarSub} numberOfLines={1}>
              {episodeLabel}
              {user && isWatched && ordered.length > 0
                ? ` · ${ordered.length} take${ordered.length === 1 ? '' : 's'}`
                : ''}
            </Text>
          </View>
          <View style={{ width: 26 }} />
        </View>
        {renderBody()}
      </SafeAreaView>
    </>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 48,
    },
    muted: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 52,
      paddingHorizontal: Spacing.md,
    },
    topBarCopy: {
      flex: 1,
      alignItems: 'center',
      marginHorizontal: 8,
    },
    topBarTitle: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: colors.text,
    },
    topBarSub: {
      fontSize: 10,
      letterSpacing: 0.8,
      color: colors.textTertiary,
      marginTop: 1,
    },
    gateWrap: {
      paddingHorizontal: 12,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: Spacing.xxl,
      ...(Platform.OS === 'web' ? { maxWidth: 768, width: '100%', alignSelf: 'center' as const } : {}),
    },
  });
}
