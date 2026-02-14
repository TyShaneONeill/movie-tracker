import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme-context';
import { useMovieList } from '@/hooks/use-movie-lists';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl, type TMDBMovie, type MovieListType } from '@/lib/tmdb.types';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

const CATEGORY_TITLES: Record<MovieListType, string> = {
  trending: 'Trending Now',
  now_playing: 'Now Playing',
  upcoming: 'Coming Soon',
};

const NUM_COLUMNS = 3;

export default function CategoryScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [page, setPage] = useState(1);
  const [allMovies, setAllMovies] = useState<TMDBMovie[]>([]);

  const categoryType = (type as MovieListType) || 'trending';
  const title = CATEGORY_TITLES[categoryType] || 'Movies';

  const {
    movies,
    totalPages,
    isLoading,
    isFetching,
  } = useMovieList({ type: categoryType, page });

  // Append new movies when page changes
  React.useEffect(() => {
    if (movies.length > 0) {
      if (page === 1) {
        setAllMovies(movies);
      } else {
        setAllMovies((prev) => {
          // Deduplicate by movie id
          const existingIds = new Set(prev.map((m) => m.id));
          const newMovies = movies.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newMovies];
        });
      }
    }
  }, [movies, page]);

  const handleLoadMore = useCallback(() => {
    if (!isFetching && page < totalPages) {
      setPage((prev) => prev + 1);
    }
  }, [isFetching, page, totalPages]);

  const handleMoviePress = useCallback((movieId: number) => {
    router.push(`/movie/${movieId}`);
  }, []);

  const renderMovie = useCallback(
    ({ item }: { item: TMDBMovie }) => (
      <Pressable
        style={({ pressed }) => [
          styles.movieCard,
          { opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={() => handleMoviePress(item.id)}
      >
        <Image
          source={{ uri: getTMDBImageUrl(item.poster_path, 'w342') || undefined }}
          style={[styles.poster, { backgroundColor: colors.card }]}
          contentFit="cover"
          transition={200}
        />
      </Pressable>
    ),
    [colors.card, handleMoviePress]
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
          No movies found
        </Text>
      </View>
    );
  }, [isLoading, colors]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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

      {/* Movie Grid */}
      <FlatList
        data={allMovies}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMovie}
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
