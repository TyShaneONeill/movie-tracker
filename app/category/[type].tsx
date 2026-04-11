import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme-context';
import { useMovieList } from '@/hooks/use-movie-lists';
import { useTvShowList } from '@/hooks/use-tv-show-lists';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl, type TMDBMovie, type TMDBTvShow, type MovieListType, type TvShowListType } from '@/lib/tmdb.types';
import { ContentContainer } from '@/components/content-container';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

const CATEGORY_TITLES: Record<string, string> = {
  trending: 'Trending Now',
  now_playing: 'Now Playing',
  upcoming: 'Coming Soon',
  tv_trending: 'Trending TV',
  tv_airing_today: 'Airing Today',
  tv_on_the_air: 'On The Air',
  tv_top_rated: 'Top Rated TV',
};

const NUM_COLUMNS = 3;

export default function CategoryScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [page, setPage] = useState(1);
  const [allMovies, setAllMovies] = useState<TMDBMovie[]>([]);
  const [allTvShows, setAllTvShows] = useState<TMDBTvShow[]>([]);

  const isTv = type?.startsWith('tv_');
  const categoryType = (type as MovieListType) || 'trending';
  const tvListType = (type?.replace('tv_', '') as TvShowListType) || 'trending';
  const title = CATEGORY_TITLES[type || 'trending'] || (isTv ? 'TV Shows' : 'Movies');

  const {
    movies,
    totalPages: movieTotalPages,
    isLoading: movieIsLoading,
    isFetching: movieIsFetching,
  } = useMovieList({ type: categoryType, page, enabled: !isTv });

  const {
    shows,
    totalPages: tvTotalPages,
    isLoading: tvIsLoading,
    isFetching: tvIsFetching,
  } = useTvShowList({ type: tvListType, page, enabled: !!isTv });

  const totalPages = isTv ? tvTotalPages : movieTotalPages;
  const isLoading = isTv ? tvIsLoading : movieIsLoading;
  const isFetching = isTv ? tvIsFetching : movieIsFetching;

  // Append new movies when page changes
  React.useEffect(() => {
    if (!isTv && movies.length > 0) {
      if (page === 1) {
        setAllMovies(movies);
      } else {
        setAllMovies((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMovies = movies.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newMovies];
        });
      }
    }
  }, [movies, page, isTv]);

  // Append new TV shows when page changes
  React.useEffect(() => {
    if (isTv && shows.length > 0) {
      if (page === 1) {
        setAllTvShows(shows);
      } else {
        setAllTvShows((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const newShows = shows.filter((s) => !existingIds.has(s.id));
          return [...prev, ...newShows];
        });
      }
    }
  }, [shows, page, isTv]);

  const allItems = isTv ? allTvShows : allMovies;

  const handleLoadMore = useCallback(() => {
    if (!isFetching && page < totalPages) {
      setPage((prev) => prev + 1);
    }
  }, [isFetching, page, totalPages]);

  const handleItemPress = useCallback((itemId: number) => {
    if (isTv) {
      router.push(`/tv/${itemId}`);
    } else {
      router.push(`/movie/${itemId}`);
    }
  }, [isTv]);

  const renderItem = useCallback(
    ({ item }: { item: TMDBMovie | TMDBTvShow }) => (
      <Pressable
        style={({ pressed }) => [
          styles.movieCard,
          { opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={() => handleItemPress(item.id)}
      >
        <Image
          source={{ uri: getTMDBImageUrl(item.poster_path, 'w342') || undefined }}
          style={[styles.poster, { backgroundColor: colors.card }]}
          contentFit="cover"
          transition={200}
        />
      </Pressable>
    ),
    [colors.card, handleItemPress]
  );

  const renderFooter = useCallback(() => {
    if (!isFetching || page === 1) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }, [isFetching, page, colors.tint]);

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={[Typography.body.base, { color: colors.textSecondary }]}>
          No {isTv ? 'TV shows' : 'movies'} found
        </Text>
      </View>
    );
  }, [isLoading, isTv, colors]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ContentContainer style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content Grid */}
        <FlatList
          data={allItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
    marginBottom: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerSpacer: {
    width: 32, // Match back button width for centering
  },
  gridContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  movieCard: {
    flex: 1,
    maxWidth: `${100 / NUM_COLUMNS - 2}%`,
    aspectRatio: 2 / 3,
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    paddingTop: Spacing.xxl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
