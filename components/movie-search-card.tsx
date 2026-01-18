import { StyleSheet, View, TouchableOpacity, Image } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { TMDBMovie } from '@/lib/tmdb.types';
import { getTMDBImageUrl } from '@/lib/tmdb.types';

interface MovieSearchCardProps {
  movie: TMDBMovie;
  onPress?: (movie: TMDBMovie) => void;
}

export function MovieSearchCard({ movie, onPress }: MovieSearchCardProps) {
  const posterUrl = getTMDBImageUrl(movie.poster_path, 'w185');
  const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';

  return (
    <TouchableOpacity onPress={() => onPress?.(movie)} activeOpacity={0.7}>
      <ThemedView style={styles.card}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.poster} />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <ThemedText style={styles.placeholderText}>No Image</ThemedText>
          </View>
        )}
        <View style={styles.info}>
          <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.title}>
            {movie.title}
          </ThemedText>
          <ThemedText style={styles.meta}>
            {year} • ★ {rating}
          </ThemedText>
          {movie.overview && (
            <ThemedText numberOfLines={3} style={styles.overview}>
              {movie.overview}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: 8,
  },
  posterPlaceholder: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 10,
    opacity: 0.5,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  overview: {
    fontSize: 13,
    opacity: 0.8,
    lineHeight: 18,
  },
});
