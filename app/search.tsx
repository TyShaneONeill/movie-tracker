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
  Platform,
  useWindowDimensions,
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
import { TvShowSearchCard } from '@/components/tv-show-search-card';
import { MediaTypeToggle, type MediaType } from '@/components/media-type-toggle';
import { UserSearchResult } from '@/components/social/UserSearchResult';
import { useUserSearch } from '@/hooks/use-user-search';
import { useTvShowSearch } from '@/hooks/use-tv-show-search';
import { useDiscoverTvShows } from '@/hooks/use-discover-tv-shows';
import { useTvShowList } from '@/hooks/use-tv-show-lists';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBMovie, TMDBTvShow, SearchType } from '@/lib/tmdb.types';
import { useMovieList } from '@/hooks/use-movie-lists';
import { SearchSkeletonList } from '@/components/search-skeleton';
import { useNetwork } from '@/lib/network-context';
import { analytics } from '@/lib/analytics';
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
const MOVIE_CATEGORIES = ['Top Results', 'People', 'Lists', 'Users'];
const TV_CATEGORIES = ['Top Results', 'Users'];

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

// TV genre data with curated poster images
const TV_GENRES_DATA = [
  {
    id: 10765,
    name: 'Sci-Fi & Fantasy',
    posters: [
      '/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', // Stranger Things
      '/7vjaCdMw15FEbXyLQTVa04URsPm.jpg', // The Witcher
      '/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg', // Loki
    ],
  },
  {
    id: 10759,
    name: 'Action & Adventure',
    posters: [
      '/stTEycfG9928HYGEISBFaG1ngjM.jpg', // The Boys
      '/6ovk8JEVej2RiTeDl91BPMNiel9.jpg', // Jack Ryan
      '/jNFDCiHAPnSgGJDgb5E5UaBekNJ.jpg', // Reacher
    ],
  },
  {
    id: 16,
    name: 'Animation',
    posters: [
      '/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg', // Arcane
      '/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg', // Attack on Titan
      '/gdIrmf2DdY5mgN6ycVP0XlzKzbE.jpg', // Rick and Morty
    ],
  },
  {
    id: 18,
    name: 'Drama',
    posters: [
      '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', // Breaking Bad
      '/e3NBGiAifW9Xt8xD5tpARskjccO.jpg', // Succession
      '/1M3W6jIN4AWmACZQ6hIkbhz4TVo.jpg', // The Crown
    ],
  },
  {
    id: 35,
    name: 'Comedy',
    posters: [
      '/dYvIUzdh6TUv4IFRq8UBkX7bNqs.jpg', // Ted Lasso
      '/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg', // The Office
      '/iRJhFOsVfj5tAKE9UNQ2gPgJqop.jpg', // Schitt's Creek
    ],
  },
  {
    id: 9648,
    name: 'Mystery',
    posters: [
      '/aoRMBnpMfBDAVaxHF3iQ6yBgg3P.jpg', // True Detective
      '/pJJQEBoRKiiNjnJYsJPmMCMBOLI.jpg', // Severance
      '/5LoMsFVTKRiUEZA5gafssFt7YaQ.jpg', // Dark
    ],
  },
];

const MAX_APP_WIDTH = 768;

export default function SearchScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { isOffline } = useNetwork();
  const { width: screenWidth } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Top Results');
  const [mediaType, setMediaType] = useState<MediaType>('movies');
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

  // Movie hooks (only active when mediaType === 'movies')
  const { movies, isLoading: isMovieLoading, isError: isMovieError, error: movieError } = useMovieSearch({
    query: debouncedQuery,
    searchType,
    enabled: mediaType === 'movies' && debouncedQuery.length >= 2 && activeCategory !== 'Users',
  });

  const {
    movies: genreMovies,
    isLoading: isGenreMovieLoading,
    isError: isGenreMovieError,
    error: genreMovieError,
    isFetchingNextPage: isFetchingNextMoviePage,
    hasNextPage: hasNextMoviePage,
    fetchNextPage: fetchNextMoviePage,
  } = useDiscoverMovies({
    genreId: selectedGenre?.id ?? null,
    enabled: mediaType === 'movies' && selectedGenre !== null,
  });

  const { movies: trendingMovies } = useMovieList({
    type: 'trending',
    enabled: mediaType === 'movies',
  });

  // TV hooks (only active when mediaType === 'tv')
  const { shows: tvShows, isLoading: isTvLoading, isError: isTvError, error: tvError } = useTvShowSearch({
    query: debouncedQuery,
    enabled: mediaType === 'tv' && debouncedQuery.length >= 2 && activeCategory !== 'Users',
  });

  const {
    shows: genreTvShows,
    isLoading: isGenreTvLoading,
    isError: isGenreTvError,
    error: genreTvError,
    isFetchingNextPage: isFetchingNextTvPage,
    hasNextPage: hasNextTvPage,
    fetchNextPage: fetchNextTvPage,
  } = useDiscoverTvShows({
    genreId: selectedGenre?.id ?? null,
    enabled: mediaType === 'tv' && selectedGenre !== null,
  });

  const { shows: trendingTvShows } = useTvShowList({
    type: 'trending',
    enabled: mediaType === 'tv',
  });

  // User search hook
  const { users, isLoading: isUserLoading, isError: isUserError, error: userError } = useUserSearch(
    activeCategory === 'Users' ? debouncedQuery : ''
  );

  // Combine loading/error states based on active category and media type
  const isContentLoading = activeCategory === 'Users'
    ? isUserLoading
    : mediaType === 'movies' ? isMovieLoading : isTvLoading;
  const isGenreLoading = mediaType === 'movies' ? isGenreMovieLoading : isGenreTvLoading;
  const isLoading = activeCategory === 'Users' ? isUserLoading : isContentLoading;
  const isError = activeCategory === 'Users' ? isUserError : (mediaType === 'movies' ? isMovieError : isTvError);
  const error = activeCategory === 'Users' ? userError : (mediaType === 'movies' ? movieError : tvError);
  const isGenreError = mediaType === 'movies' ? isGenreMovieError : isGenreTvError;
  const genreError = mediaType === 'movies' ? genreMovieError : genreTvError;
  const genreResults = mediaType === 'movies' ? genreMovies : genreTvShows;
  const isFetchingNextPage = mediaType === 'movies' ? isFetchingNextMoviePage : isFetchingNextTvPage;
  const hasNextPage = mediaType === 'movies' ? hasNextMoviePage : hasNextTvPage;
  const fetchNextPage = mediaType === 'movies' ? fetchNextMoviePage : fetchNextTvPage;

  // Categories based on media type
  const categories = mediaType === 'movies' ? MOVIE_CATEGORIES : TV_CATEGORIES;

  // Genre data based on media type
  const genresData = mediaType === 'movies' ? GENRES_DATA : TV_GENRES_DATA;

  // Rotate genre posters every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPosterIndices((prev) => {
        const next = { ...prev };
        genresData.forEach((genre) => {
          const currentIndex = prev[genre.id] ?? 0;
          next[genre.id] = (currentIndex + 1) % genre.posters.length;
        });
        return next;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [genresData]);

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
    if (search.type === 'tv') {
      router.push(`/tv/${search.tmdbId}`);
    } else if (search.type === 'person') {
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
    addRecentSearch({
      type: 'movie',
      title: movie.title,
      subtitle: movie.release_date?.split('-')[0] || 'Movie',
      posterUrl: getTMDBImageUrl(movie.poster_path, 'w92') || undefined,
      tmdbId: movie.id,
    });
    router.push(`/movie/${movie.id}`);
  }, [addRecentSearch]);

  const handleTvShowPress = useCallback((show: TMDBTvShow) => {
    addRecentSearch({
      type: 'tv',
      title: show.name,
      subtitle: show.first_air_date?.split('-')[0] || 'TV Show',
      posterUrl: getTMDBImageUrl(show.poster_path, 'w92') || undefined,
      tmdbId: show.id,
    });
    router.push(`/tv/${show.id}`);
  }, [addRecentSearch]);

  // Track movie search results
  useEffect(() => {
    if (debouncedQuery.length >= 2 && mediaType === 'movies' && !isMovieLoading && movies.length >= 0 && activeCategory !== 'Users') {
      analytics.track('movie:search', {
        query: debouncedQuery,
        result_count: movies.length,
      });
    }
  }, [debouncedQuery, movies, isMovieLoading, mediaType, activeCategory]);

  const showSearchResults = debouncedQuery.length >= 2 || selectedGenre !== null;

  // Compute genre card width explicitly (percentage widths can fail on RN Web)
  const containerWidth = Math.min(screenWidth, MAX_APP_WIDTH) - Spacing.md * 2; // minus horizontal padding
  const genreCardWidth = (containerWidth - Spacing.sm) / 2; // 2 columns with gap

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.topRow}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>

          <View style={[styles.searchInputContainer, { backgroundColor: colors.card }]}>
            <SearchIconSvg color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={mediaType === 'movies' ? "Movies, people, lists..." : "Search TV shows..."}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel={mediaType === 'movies' ? "Search movies, people, lists" : "Search TV shows"}
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
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                style={({ pressed }) => [styles.clearInputButton, { opacity: pressed ? 0.5 : 1 }]}
              >
                <XIcon color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Media Type Toggle */}
        <View style={styles.mediaToggleContainer}>
          <MediaTypeToggle
            value={mediaType}
            onChange={(type) => {
              setMediaType(type);
              setActiveCategory('Top Results');
              setSelectedGenre(null);
            }}
          />
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {categories.map((category) => (
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
                accessibilityRole="button"
                accessibilityLabel={`Clear ${selectedGenre.name} genre filter`}
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
            ) : genreResults.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.centerTitle, { color: colors.text }]}>
                  No results found
                </Text>
                <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                  No {selectedGenre.name} {mediaType === 'movies' ? 'movies' : 'TV shows'} available
                </Text>
              </View>
            ) : mediaType === 'movies' ? (
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
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={5}
              />
            ) : (
              <FlatList
                data={genreTvShows}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TvShowSearchCard show={item} onPress={handleTvShowPress} />
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
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={5}
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
                    Connect to the internet to search
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
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                />
              )
            ) : mediaType === 'movies' ? (
              movies.length === 0 ? (
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
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                />
              )
            ) : (
              tvShows.length === 0 ? (
                <View style={styles.centerContainer}>
                  <Text style={[styles.centerTitle, { color: colors.text }]}>
                    No TV shows found
                  </Text>
                  <Text style={[styles.centerText, { color: colors.textSecondary }]}>
                    Try a different search term
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={tvShows}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => (
                    <TvShowSearchCard show={item} onPress={handleTvShowPress} />
                  )}
                  contentContainerStyle={styles.searchResultsContainer}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                />
              )
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
          {mediaType === 'movies' ? (
            trendingMovies.length > 0 && (
              <View>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.sm },
                  ]}
                >
                  TRENDING NOW
                </Text>
                <View style={styles.trendingContainer}>
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
                        accessibilityRole="button"
                        accessibilityLabel={`${movie.title}, trending movie`}
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
                </View>
              </View>
            )
          ) : (
            trendingTvShows.length > 0 && (
              <View>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.sm },
                  ]}
                >
                  TRENDING NOW
                </Text>
                <View style={styles.trendingContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.trendingScrollContent}
                    style={styles.trendingScroll}
                  >
                    {trendingTvShows.slice(0, 10).map((show) => (
                      <Pressable
                        key={show.id}
                        onPress={() => handleTvShowPress(show)}
                        accessibilityRole="button"
                        accessibilityLabel={`${show.name}, trending TV show`}
                        style={({ pressed }) => [styles.trendingCard, { opacity: pressed ? 0.8 : 1 }]}
                      >
                        <Image
                          source={{ uri: getTMDBImageUrl(show.poster_path, 'w185') || undefined }}
                          style={[styles.trendingPoster, { backgroundColor: colors.card }]}
                          contentFit="cover"
                          transition={200}
                        />
                        <Text style={[styles.trendingTitle, { color: colors.text }]} numberOfLines={2}>
                          {show.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )
          )}

          {/* Recent Searches Section */}
          {recentSearches.length > 0 && (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  RECENT
                </Text>
                <Pressable
                  onPress={handleClearRecent}
                  accessibilityRole="button"
                  accessibilityLabel="Clear recent searches"
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
                  accessibilityRole="button"
                  accessibilityLabel={`${search.title}, ${search.subtitle}`}
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
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${search.title} from recent searches`}
                    style={({ pressed }) => [styles.removeButton, { opacity: pressed ? 0.5 : 1 }]}
                    hitSlop={12}
                  >
                    <XIcon color={colors.textTertiary} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
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
            {genresData.map((genre) => {
              const posterIndex = posterIndices[genre.id] ?? 0;
              const posterPath = genre.posters[posterIndex];

              return (
                <Pressable
                  key={genre.id}
                  onPress={() => handleGenrePress(genre.id, genre.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse ${genre.name}`}
                  style={({ pressed }) => [styles.genreCard, { width: genreCardWidth, opacity: pressed ? 0.8 : 1 }]}
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

          {/* Banner Ad — inside ScrollView so it doesn't steal layout space */}
          <BannerAdComponent placement="search" />
        </ScrollView>
      )}
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
    ...(Platform.OS === 'web' && { paddingTop: Spacing.md }),
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
  mediaToggleContainer: {
    marginTop: Spacing.sm,
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
  // Trending section — explicit height on web prevents the nested horizontal
  // ScrollView from expanding to fill its parent on mobile Safari, which would
  // push Browse by Genre off-screen.
  trendingContainer: Platform.OS === 'web' ? {
    height: 200,
    overflow: 'hidden' as const,
    marginHorizontal: -Spacing.md,
  } : {
    marginHorizontal: -Spacing.md,
  },
  trendingScroll: {
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
