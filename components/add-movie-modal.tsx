import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/lib/theme-context';
import { useUserMovies, useMovieInLibrary } from '@/hooks/use-user-movies';
import { Colors } from '@/constants/theme';
import type { TMDBMovie } from '@/lib/tmdb.types';
import type { MovieStatus } from '@/lib/database.types';
import { getTMDBImageUrl } from '@/lib/tmdb.types';

interface AddMovieModalProps {
  movie: TMDBMovie | null;
  visible: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: MovieStatus; label: string; icon: string }[] = [
  { value: 'watchlist', label: 'Add to Watchlist', icon: 'bookmark-outline' },
  { value: 'watching', label: 'Currently Watching', icon: 'play-circle-outline' },
  { value: 'watched', label: 'Mark as Watched', icon: 'checkmark-circle-outline' },
];

// Status button colors
const STATUS_BUTTON_COLORS: Record<MovieStatus, string> = {
  watchlist: '#f59e0b', // amber
  watching: '#3b82f6',  // blue
  watched: '#22c55e',   // green
};

export function AddMovieModal({ movie, visible, onClose }: AddMovieModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { addMovie, isAdding, updateStatus, isUpdating } = useUserMovies();
  const { data: existingMovie, isLoading: isChecking } = useMovieInLibrary(
    movie?.id ?? 0
  );

  const handleAddMovie = async (status: MovieStatus) => {
    hapticImpact();
    if (!movie) return;

    try {
      if (existingMovie) {
        // Movie already in library, update status
        await updateStatus({ tmdbId: existingMovie.tmdb_id, status });
        hapticNotification(NotificationFeedbackType.Success);
        Alert.alert('Updated', `"${movie.title}" status changed to ${status}`);
      } else {
        // Add new movie
        await addMovie({ movie, status });
        hapticNotification(NotificationFeedbackType.Success);
        Alert.alert('Added', `"${movie.title}" added to your ${status}!`);
      }
      onClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', errorMessage || 'Failed to add movie');
    }
  };

  if (!movie) return null;

  const posterUrl = getTMDBImageUrl(movie.poster_path, 'w342');
  const year = movie.release_date?.split('-')[0] || 'N/A';
  const isLoading = isAdding || isUpdating || isChecking;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">
            {existingMovie ? 'Update Status' : 'Add to Library'}
          </ThemedText>
          <TouchableOpacity onPress={() => {
            hapticImpact();
            onClose();
          }} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.movieInfo}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.poster} />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <ThemedText>No Image</ThemedText>
            </View>
          )}
          <View style={styles.details}>
            <ThemedText type="subtitle" numberOfLines={2}>
              {movie.title}
            </ThemedText>
            <ThemedText style={styles.meta}>
              {year} • ★ {movie.vote_average?.toFixed(1) || 'N/A'}
            </ThemedText>
            {existingMovie && (
              <View style={styles.currentStatus}>
                <ThemedText style={styles.currentStatusText}>
                  Currently: {existingMovie.status}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        {movie.overview && (
          <ThemedText numberOfLines={4} style={styles.overview}>
            {movie.overview}
          </ThemedText>
        )}

        <View style={styles.actions}>
          {STATUS_OPTIONS.map((option) => {
            const isCurrentStatus = existingMovie?.status === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.actionButton,
                  { backgroundColor: STATUS_BUTTON_COLORS[option.value] },
                  isCurrentStatus && styles.activeButton,
                ]}
                onPress={() => handleAddMovie(option.value)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={option.icon as keyof typeof Ionicons.glyphMap}
                      size={24}
                      color="#fff"
                    />
                    <ThemedText style={styles.actionText}>
                      {isCurrentStatus ? `${option.label} (Current)` : option.label}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButton: {
    padding: 4,
  },
  movieInfo: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 8,
  },
  posterPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  details: {
    flex: 1,
    marginLeft: 16,
  },
  meta: {
    marginTop: 8,
    opacity: 0.7,
  },
  currentStatus: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
  },
  currentStatusText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  overview: {
    opacity: 0.8,
    marginBottom: 24,
    lineHeight: 22,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  activeButton: {
    opacity: 0.7,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
