/**
 * List detail — Lists v2 (device round 1). Three modes, one flag:
 *  - watchlist (system): backdrop hero + SET MARQUEE + numbered grid. The
 *    interactive pile now lives on the profile Lists TAB, not here — the detail
 *    is "the long list of things I can scroll down" (Ty, round 1).
 *  - watching (system): backdrop hero + SET MARQUEE + merged movies/TV rows (B/E).
 *  - custom: backdrop hero + SET MARQUEE + numbered grid with long-press
 *    "Set as list cover" (C/D).
 *
 * Rendered only when `lists_v2` is enabled/resolving; the legacy screen stays
 * byte-identical off-flag.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import GlassBackButton from '@/components/ui/glass-back-button';
import { ContentContainer } from '@/components/content-container';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/action-sheet';
import { MAX_CONTENT_WIDTH } from '@/hooks/use-wide-layout';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useListDetail, useListMutations } from '@/hooks/use-list-mutations';
import { useWatchingList } from '@/hooks/use-watching-list';
import { useListCover } from '@/hooks/use-list-cover';
import { useProfile } from '@/hooks/use-profile';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { getSpecialListCover, setSpecialListCover, type SpecialListId } from '@/lib/list-cover-prefs';
import {
  formatDeepCount,
  formatSplitCount,
  type CoverCandidate,
  type MediaKind,
} from '@/lib/lists-v2-logic';
import { ListHeroBackdrop } from './list-hero-backdrop';
import { WatchingRows } from './watching-rows';
import { MarqueePicker, type MarqueeCandidate } from './marquee-picker';

const EFFECTIVE_WIDTH = Math.min(Dimensions.get('window').width, MAX_CONTENT_WIDTH);
const GRID_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (EFFECTIVE_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface GridItem {
  id: string;
  tmdbId: number;
  posterPath: string | null;
  media: MediaKind;
  title: string;
}

function toMedia(mediaType?: string | null): MediaKind {
  return mediaType === 'tv_show' || mediaType === 'tv' ? 'tv' : 'movie';
}

interface ListDetailV2Props {
  id: string;
  resolving: boolean;
}

export function ListDetailV2({ id, resolving }: ListDetailV2Props) {
  const router = useRouter();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();

  const mode: 'watchlist' | 'watching' | 'custom' =
    id === 'watchlist' ? 'watchlist' : id === 'watching' ? 'watching' : 'custom';
  // The two system lists are virtual (no row) — their cover lives in AsyncStorage.
  const specialListId: SpecialListId | null =
    mode === 'watchlist' ? 'watchlist' : mode === 'watching' ? 'watching' : null;

  // --- Data (all hooks called unconditionally) ---
  const { movies: watchlistMovies, isLoading: wlLoading, isError: wlError } = useUserMovies(
    mode === 'watchlist' ? 'watchlist' : undefined
  );
  const { items: watching, isLoading: watchingLoading, isError: watchingError } = useWatchingList();
  const { data: customList, isLoading: customLoading, isError: customError } = useListDetail(
    mode === 'custom' ? id : undefined
  );
  const { setCover, reorderMovies, removeMovie } = useListMutations(mode === 'custom' ? id : undefined);

  // Special-list cover choice (Watchlist / Watching) lives in AsyncStorage.
  const [specialCover, setSpecialCover] = useState<number | null>(null);
  useEffect(() => {
    if (specialListId) getSpecialListCover(specialListId).then(setSpecialCover);
  }, [specialListId]);

  // --- Grid items (watchlist + custom) ---
  const gridItems: GridItem[] = useMemo(() => {
    if (mode === 'watchlist') {
      return watchlistMovies.map((m) => ({
        id: m.id,
        tmdbId: m.tmdb_id,
        posterPath: m.poster_path,
        media: 'movie' as MediaKind,
        title: m.title,
      }));
    }
    if (mode === 'custom') {
      return (customList?.movies ?? []).map((m) => ({
        id: m.id,
        tmdbId: m.tmdb_id,
        posterPath: m.poster_path,
        media: toMedia(m.media_type),
        title: m.title,
      }));
    }
    return [];
  }, [mode, watchlistMovies, customList?.movies]);

  // --- Cover resolution (all three heroes) ---
  const coverCandidates: CoverCandidate[] = useMemo(() => {
    if (mode === 'watchlist') {
      // user_movies carries backdrop_path + vote_average inline — no fetch.
      return watchlistMovies.map((m) => ({
        tmdbId: m.tmdb_id,
        media: 'movie' as MediaKind,
        backdropPath: m.backdrop_path,
        score: m.vote_average ?? null,
      }));
    }
    if (mode === 'watching') {
      return watching.map((w) => ({
        tmdbId: w.tmdbId,
        media: w.media,
        backdropPath: w.backdropPath,
        score: w.voteAverage,
      }));
    }
    // custom: list_movies carries no backdrop — useListCover fetches per title.
    return gridItems.map((g) => ({ tmdbId: g.tmdbId, media: g.media, backdropPath: null, score: null }));
  }, [mode, watchlistMovies, watching, gridItems]);

  const chosenCover = specialListId ? specialCover : customList?.cover_tmdb_id ?? null;
  const chosenMedia = coverCandidates.find((c) => c.tmdbId === chosenCover)?.media;

  const { backdropUrl } = useListCover({
    candidates: coverCandidates,
    chosenTmdbId: chosenCover ?? null,
    chosenMedia,
  });

  // --- Cover picker + long-press sheet state ---
  const [pickerOpen, setPickerOpen] = useState(false);
  const [longPressed, setLongPressed] = useState<GridItem | null>(null);

  const marqueeCandidates: MarqueeCandidate[] = useMemo(() => {
    const source = mode === 'watching' ? watching : gridItems;
    return source.map((s) => ({
      tmdbId: s.tmdbId,
      media: mode === 'watching' ? (s as { media: MediaKind }).media : (s as GridItem).media,
      title: s.title,
      posterPath: s.posterPath,
    }));
  }, [mode, watching, gridItems]);

  const handlePickCover = useCallback(
    (tmdbId: number) => {
      if (specialListId) {
        setSpecialCover(tmdbId);
        setSpecialListCover(specialListId, tmdbId);
      } else {
        setCover(tmdbId).catch(() => {});
      }
      setPickerOpen(false);
    },
    [specialListId, setCover]
  );

  const handleSmartDefault = useCallback(() => {
    if (specialListId) {
      setSpecialCover(null);
      setSpecialListCover(specialListId, null);
    } else {
      setCover(null).catch(() => {});
    }
    setPickerOpen(false);
  }, [specialListId, setCover]);

  const handleGoBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const openTitle = useCallback(
    (tmdbId: number, media: MediaKind) => {
      router.push(media === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`);
    },
    [router]
  );

  // --- Long-press action sheet (custom only) ---
  const longPressOptions: ActionSheetOption[] = useMemo(() => {
    if (!longPressed) return [];
    return [
      {
        label: 'Set as list cover',
        accent: colors.tint,
        onPress: () => setCover(longPressed.tmdbId).catch(() => {}),
      },
      {
        label: 'Move to top',
        onPress: () => {
          const rest = gridItems.filter((g) => g.tmdbId !== longPressed.tmdbId).map((g) => g.tmdbId);
          reorderMovies([longPressed.tmdbId, ...rest]).catch(() => {});
        },
      },
      {
        label: 'Remove from list',
        destructive: true,
        onPress: () => removeMovie(longPressed.tmdbId).catch(() => {}),
      },
    ];
  }, [longPressed, gridItems, colors.tint, setCover, reorderMovies, removeMovie]);

  // --- Loading / error ---
  const isLoading =
    resolving ||
    (mode === 'watchlist' && wlLoading) ||
    (mode === 'watching' && watchingLoading) ||
    (mode === 'custom' && customLoading);
  const isError =
    (mode === 'watchlist' && wlError) ||
    (mode === 'watching' && watchingError) ||
    (mode === 'custom' && customError);

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <View style={[styles.backFloat, { top: insets.top + Spacing.xs }]}>
            <GlassBackButton onPress={handleGoBack} />
          </View>
        </View>
      </>
    );
  }
  if (isError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, styles.center]}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong</Text>
          <Pressable onPress={handleGoBack} style={[styles.errorBtn, { backgroundColor: colors.tint }]}>
            <Text style={styles.errorBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const creatorName = profile?.username ?? profile?.full_name ?? 'You';

  // ---------- Grid item renderer (watchlist + custom) ----------
  const renderGridItem = ({ item, index }: { item: GridItem; index: number }) => {
    const posterUrl = getTMDBImageUrl(item.posterPath, 'w342');
    return (
      <Pressable
        onPress={() => openTitle(item.tmdbId, item.media)}
        onLongPress={mode === 'custom' ? () => setLongPressed(item) : undefined}
        delayLongPress={300}
        style={({ pressed }) => [styles.gridCard, pressed && styles.gridCardPressed]}
      >
        <Image source={{ uri: posterUrl ?? undefined }} style={styles.gridPoster} contentFit="cover" transition={200} />
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{index + 1}</Text>
        </View>
      </Pressable>
    );
  };

  // ---------- WATCHING ----------
  if (mode === 'watching') {
    const subtitle = formatSplitCount(
      watching.filter((w) => w.media === 'movie').length,
      watching.filter((w) => w.media === 'tv').length
    );
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.container}>
          <ContentContainer style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
              <ListHeroBackdrop
                backdropUrl={backdropUrl}
                title="Watching"
                subtitle={`Now playing · ${subtitle}`}
                creatorName={creatorName}
                creatorAvatarUrl={profile?.avatar_url}
                onBack={handleGoBack}
                onSetMarquee={watching.length > 0 ? () => setPickerOpen(true) : undefined}
              />
              <WatchingRows
                items={watching}
                onPressItem={(item) => openTitle(item.tmdbId, item.media)}
                onFindSomething={() => router.push('/search')}
              />
            </ScrollView>
          </ContentContainer>
        </View>
        <MarqueePicker
          visible={pickerOpen}
          candidates={marqueeCandidates}
          chosenTmdbId={specialCover}
          onPick={handlePickCover}
          onUseSmartDefault={handleSmartDefault}
          onClose={() => setPickerOpen(false)}
        />
      </>
    );
  }

  // ---------- WATCHLIST + CUSTOM: backdrop hero + numbered grid ----------
  const listSubtitle =
    mode === 'watchlist'
      ? gridItems.length > 0
        ? formatDeepCount(gridItems.length)
        : 'Your watchlist is empty'
      : customList?.description
        ? `${customList.description} · ${gridItems.length} ${gridItems.length === 1 ? 'title' : 'titles'}`
        : `${gridItems.length} ${gridItems.length === 1 ? 'title' : 'titles'}`;

  const listHeader = (
    <ListHeroBackdrop
      backdropUrl={backdropUrl}
      title={mode === 'watchlist' ? 'Watchlist' : customList?.name ?? 'List'}
      subtitle={listSubtitle}
      creatorName={creatorName}
      creatorAvatarUrl={profile?.avatar_url}
      onBack={handleGoBack}
      onSetMarquee={gridItems.length > 0 ? () => setPickerOpen(true) : undefined}
    />
  );

  const GridEmpty = () => (
    <View style={styles.gridEmpty}>
      <Text style={[styles.gridEmptyText, { color: colors.textSecondary }]}>
        {mode === 'watchlist'
          ? 'Your watchlist is empty. Add films from search or a movie page.'
          : 'No titles in this list yet.'}
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <ContentContainer style={{ flex: 1 }}>
          <FlatList
            data={gridItems}
            keyExtractor={(item) => item.id}
            renderItem={renderGridItem}
            numColumns={NUM_COLUMNS}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={GridEmpty}
            columnWrapperStyle={gridItems.length > 0 ? styles.columnWrapper : undefined}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
          />
        </ContentContainer>
      </View>
      <MarqueePicker
        visible={pickerOpen}
        candidates={marqueeCandidates}
        chosenTmdbId={chosenCover ?? null}
        onPick={handlePickCover}
        onUseSmartDefault={handleSmartDefault}
        onClose={() => setPickerOpen(false)}
      />
      {mode === 'custom' && (
        <ActionSheet
          visible={longPressed !== null}
          onClose={() => setLongPressed(null)}
          options={longPressOptions}
          title={longPressed?.title}
        />
      )}
    </>
  );
}

type ThemeColors = typeof Colors.dark;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollBody: {
      paddingBottom: Spacing.xxl,
    },
    listContent: {
      paddingBottom: Spacing.xxl,
    },
    columnWrapper: {
      paddingHorizontal: GRID_PADDING,
      gap: GRID_GAP,
      marginTop: GRID_GAP,
    },
    backFloat: {
      position: 'absolute',
      left: Spacing.md,
      zIndex: 30,
    },
    gridEmpty: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.xxl,
      alignItems: 'center',
    },
    gridEmptyText: {
      ...Typography.body.base,
      textAlign: 'center',
      lineHeight: 24,
    },
    // Grid
    gridCard: {
      width: ITEM_WIDTH,
      aspectRatio: 2 / 3,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    gridCardPressed: {
      opacity: 0.8,
    },
    gridPoster: {
      width: '100%',
      height: '100%',
    },
    rankBadge: {
      position: 'absolute',
      top: Spacing.xs,
      left: Spacing.xs,
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      minWidth: 24,
      alignItems: 'center',
    },
    rankText: {
      ...Typography.caption.medium,
      color: '#ffffff',
    },
    errorTitle: {
      ...Typography.display.h4,
      marginBottom: Spacing.md,
    },
    errorBtn: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.md,
    },
    errorBtnText: {
      ...Typography.button.primary,
      color: Colors.dark.text,
    },
  });
