/**
 * Search Screen
 * - Sticky header with back button + search input
 * - Category filter chips
 * - Recent searches with persistence (AsyncStorage)
 * - Browse by Genre with rotating poster backgrounds
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { Tag } from '@/components/ui/tag';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useDiscoverMovies } from '@/hooks/use-discover-movies';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useRecentSearches, type RecentSearch } from '@/hooks/use-recent-searches';
import { MovieSearchCard } from '@/components/movie-search-card';
import { UserSearchResult } from '@/components/social/UserSearchResult';
import { useUserSearch } from '@/hooks/use-user-search';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBMovie, SearchType } from '@/lib/tmdb.types';
import { useMovieList } from '@/hooks/use-movie-lists';
import { SearchSkeletonList } from '@/components/search-skeleton';
import { useNetwork } from '@/lib/network-context';
import { BannerAdComponent } from '@/components/ads/banner-ad';

// SVG Icons
const BackIcon = ({ color = 'white' }: { color?: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

const SearchIconSvg = ({ color = '#a1a1aa' }: { color?: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Circle cx={11} cy={11} r={8} />
    <Line x1={21} y1={21} x2={16.65} y2={16.65} />
  </Svg>
);

const ClockIcon = ({ color = '#a1a1aa' }: { color?: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Circle cx={12} cy={12} r={10} />
    <Polyline points="12 6 12 12 16 14" />
  </Svg>
);

const XIcon = ({ color = '#a1a1aa' }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
    <Line x1={18} y1={6} x2={6} y2={18} />
    <Line x1={6} y1={6} x2={18} y2={18} />
  </Svg>
);

// Category filter options
const CATEGORIES = ['Top Results', 'Movies', 'People', 'Lists', 'Users'];

// Genre data with curated poster images (no API calls needed)
// Each genre has multiple posters that rotate
const GENRES_DATA = [
  {
    id: 878,
    name: 'Sci-Fi',
    posters: [
      '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', // Dune
      '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', // Interstellar
      '/or06FN3Dka5tuj1fnIiOJwxmMj.jpg', // Blade Runner 2049
    ],
  },
  {
    id: 28,
    name: 'Action',
    posters: [
      '/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg', // Top Gun Maverick
      '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', // Mission Impossible
      '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', // John Wick
    ],
  },
  {
    id: 16,
    name: 'Animation',
    posters: [
      '/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg', // Spider-Verse
      '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', // Soul
      '/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg', // Coco
    ],
  },
  {
    id: 18,
    name: 'Drama',
    posters: [
      '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', // Dune
      '/ngl2FKBlU4fhbdsrtdom9LVLBXw.jpg', // Oppenheimer
      '/mBaXZ95R2OxueZhvQbcEWy2DqyO.jpg', // Parasite
    ],
  },
  {
    id: 35,
    name: 'Comedy',
    posters: [
      '/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg', // Barbie
      '/kCGlIMHnOm8JPXq3rXM6c5wMxcT.jpg', // The Grand Budapest Hotel
      '/svIDTNUoajS8dLEo7EosxvyAsgJ.jpg', // Knives Out
    ],
  },
  {
    id: 27,
    name: 'Horror',
    posters: [
      '/wVYREutTvI2tmxr6ujrHT704wGF.jpg', // Hereditary
      '/wAkpPm3wcHRqZl8XjPPzLCGrlW.jpg', // Get Out
      '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Midsommar
    ],
  },
];

export default function SearchScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { isOffline } = useNetwork();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Top Results');
  // Search type state - setter will be used when search type toggle UI is implemented
  const [searchType] = useState<SearchType>('title');
  const [posterIndices, setPosterIndices] = useState<Record<number, number>>({});
  const [selectedGenre, setSelectedGenre] = useState<{ id: number; name: string } | null>(null);

  // Debounce the search query
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // Recent searches hook
  const {
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  } = useRecentSearches();

  // Movie search hook
  const { movies, isLoading: isMovieLoading, isError: isMovieError, error: movieError } = useMovieSearch({
    query: debouncedQuery,
    searchType,
    enabled: debouncedQuery.length >= 2 && activeCategory !== 'Users',
  });

  // User search hook
  const { users, isLoading: isUserLoading, isError: isUserError, error: userError } = useUserSearch(
    activeCategory === 'Users' ? debouncedQuery : ''
  );

  // Discover movies by genre hook
  const {
    movies: genreMovies,
    isLoading: isGenreLoading,
    isError: isGenreError,
    error: genreError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useDiscoverMovies({
    genreId: selectedGenre?.id ?? null,
    enabled: selectedGenre !== null,
  });

  // Trending movies for empty state
  const { movies: trendingMovies } = useMovieList({
    type: 'trending',
  });

  // Combine loading/error states based on active category
  const isLoading = activeCategory === 'Users' ? isUserLoading : isMovieLoading;
  const isError = activeCategory === 'Users' ? isUserError : isMovieError;
  const error = activeCategory === 'Users' ? userError : movieError;

  // Rotate genre posters every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPosterIndices((prev) => {
        const next = { ...prev };
        GENRES_DATA.forEach((genre) => {
          const currentIndex = prev[genre.id] ?? 0;
          next[genre.id] = (currentIndex + 1) % genre.posters.length;
        });
        return next;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
  }, [clearRecentSearches]);

  const handleRecentSearchPress = useCallback((search: RecentSearch) => {
    if (search.type === 'person') {
      router.push(`/person/${search.tmdbId}`);
    } else {
      router.push(`/movie/${search.tmdbId}`);
    }
  }, []);

  const handleRemoveRecentSearch = useCallback((id: string) => {
    removeRecentSearch(id);
  }, [removeRecentSearch]);

  const handleGenrePress = useCallback((genreId: number, genreName: string) => {
    setSelectedGenre({ id: genreId, name: genreName });
    setSearchQuery('');
  }, []);

  const handleClearGenre = useCallback(() => {
    setSelectedGenre(null);
  }, []);

  const handleMoviePress = useCallback((movie: TMDBMovie) => {
    // Add to recent searches
    addRecentSearch({
      type: 'movie',
      title: movie.title,
      subtitle: movie.release_date?.split('-')[0] || 'Movie',
      posterUrl: getTMDBImageUrl(movie.poster_path, 'w92') || undefined,
      tmdbId: movie.id,
    });
    router.push(`/movie/${movie.id}`);
  }, [addRecentSearch]);

  const showSearchResults = debouncedQuery.length >= 2 || selectedGenre !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.topRow}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>

          <View style={[styles.searchInputContainer, { backgroundColor: colors.card }]}>
            <SearchIconSvg color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Movies, people, lists..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.length > 0 && selectedGenre) {
                  setSelectedGenre(null);
                }
              }}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setSelectedGenre(null);
                }}
                style={({ pressed }) => [styles.clearInputButton, { opacity: pressed ? 0.5 : 1 }]}
              >
                <XIcon color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORIES.map((category) => (
            <Tag
              key={category}
              label={category}
              active={activeCategory === category}
              onPress={() => setActiveCategory(category)}
            />
          ))}
        </ScrollView>

        {/* Active Genre Chip */}
        {selectedGenre && (
          <View style={styles.genreChipContainer}>
            <View style={[styles.genreChip, { backgroundColor: colors.tint }]}>
              <Text style={styles.genreChipText}>{selectedGenre.name}</Text>
              <Pressable
                onPress={handleClearGenre}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <XIcon color="white" />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Content */}
      {showSearchResults ? (
        <View style={styles.content}>
          {selectedGenre ? (
            // Genre discover results
            isGenreLoading ? (
              isOffline ? (
                <View style={styles.centerContainer}>
                  <Text style={[styles.centerTitle, { color: colors.text }]}>
                    You&apos;re offline
                  </Text>
                  <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                    Connect to the internet to browse genres
                  </Text>
                </View>
              ) : (
                <SearchSkeletonList cardColor={colors.card} shimmerColor={colors.backgroundSecondary} />
              )
            ) : isGenreError ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.centerTitle, { color: colors.text }]}>
                  Something went wrong
                </Text>
                <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                  {genreError?.message || 'Please try again'}
                </Text>
              </View>
            ) : genreMovies.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.centerTitle, { color: colors.text }]}>
                  No movies found
                </Text>
                <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                  No {selectedGenre.name} movies available
                </Text>
              </View>
            ) : (
              <FlatList
                data={genreMovies}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <MovieSearchCard movie={item} onPress={handleMoviePress} />
                )}
                contentContainerStyle={styles.searchResultsContainer}
                showsVerticalScrollIndicator={false}
                onEndReached={() => {
                  if (hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isFetchingNextPage ? (
                    <View style={styles.loadingFooter}>
                      <ActivityIndicator size="small" color={colors.tint} />
                    </View>
                  ) : null
                }
              />
            )
          ) : (
            // Text search results (existing logic)
            isLoading ? (
              isOffline ? (
                <View style={styles.centerContainer}>
                  <Text style={[styles.centerTitle, { color: colors.text }]}>
                    You&apos;re offline
                  </Text>
                  <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                    Connect to the internet to search for movies
                  </Text>
                </View>
              ) : (
                <SearchSkeletonList cardColor={colors.card} shimmerColor={colors.backgroundSecondary} />
              )
            ) : isError ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.centerTitle, { color: colors.text }]}>
                  Something went wrong
                </Text>
                <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                  {error?.message || 'Please try again'}
                </Text>
              </View>
            ) : activeCategory === 'Users' ? (
              users.length === 0 ? (
                <View style={styles.centerContainer}>
                  <Text style={[styles.centerTitle, { color: colors.text }]}>
                    No users found
                  </Text>
                  <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                    Try a different username
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={users}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <UserSearchResult
                      user={item}
                      onPress={() => router.push(`/user/${item.id}`)}
                    />
                  )}
                  contentContainerStyle={styles.searchResultsContainer}
                  showsVerticalScrollIndicator={false}
                />
              )
            ) : movies.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.centerTitle, { color: colors.text }]}>
                  No results found
                </Text>
                <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                  Try a different search term
                </Text>
              </View>
            ) : (
              <FlatList
                data={movies}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <MovieSearchCard movie={item} onPress={handleMoviePress} />
                )}
                contentContainerStyle={styles.searchResultsContainer}
                showsVerticalScrollIndicator={false}
              />
            )
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Trending Now Section */}
          {trendingMovies.length > 0 && (
            <>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.sm },
                ]}
              >
                TRENDING NOW
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trendingScrollContent}
                style={styles.trendingScroll}
              >
                {trendingMovies.slice(0, 10).map((movie) => (
                  <Pressable
                    key={movie.id}
                    onPress={() => handleMoviePress(movie)}
                    style={({ pressed }) => [styles.trendingCard, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Image
                      source={{ uri: getTMDBImageUrl(movie.poster_path, 'w185') || undefined }}
                      style={[styles.trendingPoster, { backgroundColor: colors.card }]}
                      contentFit="cover"
                      transition={200}
                    />
                    <Text style={[styles.trendingTitle, { color: colors.text }]} numberOfLines={2}>
                      {movie.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Recent Searches Section */}
          {recentSearches.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  RECENT
                </Text>
                <Pressable
                  onPress={handleClearRecent}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={[styles.clearButton, { color: colors.textSecondary }]}>
                    Clear
                  </Text>
                </Pressable>
              </View>

              {recentSearches.map((search) => (
                <Pressable
                  key={search.id}
                  onPress={() => handleRecentSearchPress(search)}
                  style={({ pressed }) => [
                    styles.recentItem,
                    { backgroundColor: pressed ? colors.backgroundSecondary : 'transparent' },
                  ]}
                >
                  {search.posterUrl ? (
                    <Image
                      source={{ uri: search.posterUrl }}
                      style={[styles.recentPoster, { backgroundColor: colors.card }]}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.recentIconContainer, { backgroundColor: colors.card }]}>
                      <ClockIcon color={colors.textSecondary} />
                    </View>
                  )}

                  <View style={styles.recentTextContainer}>
                    <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
                      {search.title}
                    </Text>
                    <Text style={[styles.recentSubtitle, { color: colors.textSecondary }]}>
                      {search.subtitle}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleRemoveRecentSearch(search.id)}
                    style={({ pressed }) => [styles.removeButton, { opacity: pressed ? 0.5 : 1 }]}
                    hitSlop={12}
                  >
                    <XIcon color={colors.textTertiary} />
                  </Pressable>
                </Pressable>
              ))}
            </>
          )}

          {/* Browse by Genre Section */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.textSecondary, marginTop: recentSearches.length > 0 ? Spacing.lg : Spacing.sm },
            ]}
          >
            BROWSE BY GENRE
          </Text>

          <View style={styles.genreGrid}>
            {GENRES_DATA.map((genre) => {
              const posterIndex = posterIndices[genre.id] ?? 0;
              const posterPath = genre.posters[posterIndex];

              return (
                <Pressable
                  key={genre.id}
                  onPress={() => handleGenrePress(genre.id, genre.name)}
                  style={({ pressed }) => [styles.genreCard, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <Image
                    source={{ uri: getTMDBImageUrl(posterPath, 'w342') || undefined }}
                    style={styles.genreImage}
                    contentFit="cover"
                    transition={800}
                  />
                  <LinearGradient
                    colors={['rgba(225, 29, 72, 0.85)', 'rgba(15, 15, 19, 0.9)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.genreOverlay}
                  />
                  <Text style={styles.genreName}>{genre.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Bottom Banner Ad */}
      <BannerAdComponent />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    paddingVertical: Spacing.xs,
  },
  clearInputButton: {
    padding: Spacing.xs,
  },
  categoryScroll: {
    marginTop: Spacing.sm,
  },
  categoryScrollContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearButton: {
    fontSize: 14,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  recentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPoster: {
    width: 40,
    height: 60,
    borderRadius: BorderRadius.sm,
  },
  recentTextContainer: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  recentSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  removeButton: {
    padding: Spacing.sm,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  genreCard: {
    width: '48.5%',
    height: 90,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  genreOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  genreName: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: 'white',
    zIndex: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Search results
  searchResultsContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Spacing.xxl,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  centerText: {
    fontSize: 16,
    textAlign: 'center',
  },
  genreChipContainer: {
    flexDirection: 'row',
    paddingTop: Spacing.sm,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  genreChipText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  // Trending section
  trendingScroll: {
    marginHorizontal: -Spacing.md,
  },
  trendingScrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  trendingCard: {
    width: 110,
  },
  trendingPoster: {
    width: 110,
    height: 165,
    borderRadius: BorderRadius.md,
    marginBottom: 6,
  },
  trendingTitle: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
});
