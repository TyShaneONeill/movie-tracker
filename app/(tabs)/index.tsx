import { useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SearchInput } from '@/components/search-input';
import { SearchTypeToggle } from '@/components/search-type-toggle';
import { MovieSearchCard } from '@/components/movie-search-card';
import { AddMovieModal } from '@/components/add-movie-modal';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/use-auth';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie, MovieStatus } from '@/lib/database.types';
import type { TMDBMovie, SearchType } from '@/lib/tmdb.types';

const STATUS_LABELS: Record<MovieStatus, string> = {
  watchlist: 'Watchlist',
  watching: 'Watching',
  watched: 'Watched',
};

const STATUS_COLORS: Record<MovieStatus, string> = {
  watchlist: '#f59e0b', // Amber
  watching: '#3b82f6', // Blue
  watched: '#10b981', // Emerald
};

function UserMovieCard({ movie }: { movie: UserMovie }) {
  const posterUrl = getTMDBImageUrl(movie.poster_path, 'w342'); // Higher res for better visuals
  const year = movie.release_date?.split('-')[0] || 'N/A';
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  return (
    <View style={[styles.movieCard, { backgroundColor: colors.card }]}>
      <View style={styles.posterContainer}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.moviePoster} resizeMode="cover" />
        ) : (
          <View style={[styles.moviePoster, styles.posterPlaceholder, { backgroundColor: colors.border }]}>
            <Ionicons name="image-outline" size={24} color={colors.icon} />
          </View>
        )}
        <View style={styles.gradientOverlay} />
      </View>

      <View style={styles.movieInfo}>
        <View>
          <ThemedText type="defaultSemiBold" style={styles.movieTitle} numberOfLines={1}>
            {movie.title}
          </ThemedText>
          <ThemedText style={[styles.movieMeta, { color: colors.icon }]}>
            {year} • ★ {movie.vote_average?.toFixed(1) || 'N/A'}
          </ThemedText>
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[movie.status] + '20' }, // 20% opacity background
          ]}
        >
          <ThemedText style={[styles.statusText, { color: STATUS_COLORS[movie.status] }]}>
            {STATUS_LABELS[movie.status]}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="film-outline" size={64} color="#666" style={{ marginBottom: 16, opacity: 0.5 }} />
      <ThemedText type="subtitle" style={styles.emptyTitle}>
        Your collection is empty
      </ThemedText>
      <ThemedText style={styles.emptyText}>
        Search for movies above to start tracking
      </ThemedText>
    </View>
  );
}

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const { user } = useAuth();

  // Force dark mode logic for consistency if desired, or respect system
  const theme = colorScheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[theme];

  const {
    movies,
    isLoading,
    refetch,
  } = useUserMovies();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('title');
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const isSearching = debouncedQuery.length >= 2;

  const {
    movies: searchResults,
    isLoading: isSearchLoading,
    isError: isSearchError,
    error: searchError,
    totalResults,
    actor,
  } = useMovieSearch({
    query: debouncedQuery,
    searchType,
    enabled: isSearching,
  });

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleMoviePress = (movie: TMDBMovie) => {
    setSelectedMovie(movie);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setSelectedMovie(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
      edges={['top']}
    >
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <View>
            <ThemedText style={[styles.greeting, { color: colors.icon }]}>Welcome back,</ThemedText>
            <ThemedText type="title" style={styles.headerTitle}>
              {user?.email?.split('@')[0] || 'Cinephile'}
            </ThemedText>
          </View>
          {/* Profile icon could go here in future */}
        </View>

        <View style={styles.searchSection}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClear={handleClearSearch}
            placeholder={searchType === 'title' ? 'Find a movie...' : 'Find by actor...'}
          />
          <View style={{ height: 12 }} />
          <SearchTypeToggle value={searchType} onChange={setSearchType} />
        </View>

        {isSearching ? (
          <View style={{ flex: 1 }}>
            <View style={styles.listHeader}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {actor ? `Movies with ${actor.name}` : 'Results'}
              </ThemedText>
              {totalResults > 0 && (
                <ThemedText style={styles.resultCount}>
                  {totalResults} found
                </ThemedText>
              )}
            </View>

            {isSearchLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.tint} />
              </View>
            ) : isSearchError ? (
              <View style={styles.errorContainer}>
                <ThemedText style={styles.errorText}>
                  {searchError?.message || 'Search failed'}
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <MovieSearchCard movie={item} onPress={handleMoviePress} />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <ThemedText style={styles.emptyText}>
                      No results for "{debouncedQuery}"
                    </ThemedText>
                  </View>
                }
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.listHeader}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Your Watchlist
              </ThemedText>
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.tint} />
              </View>
            ) : (
              <FlatList
                data={movies}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <UserMovieCard movie={item} />}
                ListEmptyComponent={EmptyState}
                contentContainerStyle={[styles.listContent, movies.length === 0 && { flex: 1 }]}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={colors.tint}
                  />
                }
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}
      </View>

      <AddMovieModal
        movie={selectedMovie}
        visible={showAddModal}
        onClose={handleCloseModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
    marginTop: 12,
  },
  greeting: {
    fontSize: 14,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
  },
  searchSection: {
    marginBottom: 24,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  resultCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  listContent: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    textAlign: 'center',
    opacity: 0.7,
  },

  // Card Styles
  movieCard: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    height: 140, // Fixed height for consistency
  },
  posterContainer: {
    width: 93, // ~2/3 aspect ratio
    height: '100%',
    backgroundColor: '#333',
  },
  moviePoster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)', // Subtle overlay
  },
  movieInfo: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  movieTitle: {
    fontSize: 16,
    marginBottom: 6,
  },
  movieMeta: {
    fontSize: 13,
    fontWeight: '500',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    opacity: 0.7,
    textAlign: 'center',
    width: '70%',
  },
});
