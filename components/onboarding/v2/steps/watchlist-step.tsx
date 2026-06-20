import { View, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { StepLayout } from '@/components/onboarding/v2/shared/step-layout';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { useOnboardingV2 } from '@/components/onboarding/v2/onboarding-v2-context';
import { useOnboardingMovies } from '@/hooks/use-onboarding-movies';
import { genreSlugsToLabels } from '@/components/onboarding/v2/data/genres';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBMovie } from '@/lib/tmdb.types';
import type { StepProps } from '@/components/onboarding/v2/types';

const COLS = 3;
const GAP = Spacing.sm;

export function WatchlistStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const { width } = useWindowDimensions();
  const { data, toggleWatchlist } = useOnboardingV2();
  const { data: movies, isLoading, isError } = useOnboardingMovies(data.genres);

  const itemWidth = (Math.min(width, 720) - Spacing.lg * 2 - GAP * (COLS - 1)) / COLS;
  const count = data.watchlist.length;
  const canContinue = count >= 1;

  const labels = genreSlugsToLabels(data.genres).slice(0, 2);
  const subtitle = labels.length
    ? `Picked for your love of ${labels.join(' & ')}. Add a few — 3 is a great start.`
    : 'Add a few titles to get started — 3 is a great start.';

  return (
    <StepLayout
      title="What's next on your list?"
      subtitle={subtitle}
      footer={
        <CTAButton
          label={count > 0 ? `Add ${count} & continue` : 'Add at least one'}
          onPress={onNext}
          disabled={!canContinue}
        />
      }
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : isError || !movies || movies.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={[styles.fallback, { color: colors.textSecondary }]}>
            Couldn&apos;t load picks right now — you can build your list anytime from the app.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.grid}>
          {movies.map((movie: TMDBMovie) => {
            const selected = data.watchlist.some((m) => m.id === movie.id);
            const poster = getTMDBImageUrl(movie.poster_path, 'w342');
            return (
              <Pressable
                key={movie.id}
                onPress={() => toggleWatchlist(movie)}
                style={[styles.poster, { width: itemWidth, borderColor: selected ? colors.tint : 'transparent' }]}
              >
                {poster ? (
                  <Image source={{ uri: poster }} style={styles.posterImg} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.posterImg, styles.posterFallback, { backgroundColor: colors.card }]}>
                    <ThemedText style={[styles.posterTitle, { color: colors.textSecondary }]} numberOfLines={3}>
                      {movie.title}
                    </ThemedText>
                  </View>
                )}

                <View style={[styles.badge, { backgroundColor: selected ? colors.tint : 'rgba(0,0,0,0.6)' }]}>
                  <Ionicons name={selected ? 'checkmark' : 'add'} size={16} color="#fff" />
                </View>

                {selected && (
                  <View style={[styles.onListStrip, { backgroundColor: colors.tint }]}>
                    <ThemedText style={styles.onListText}>ON LIST</ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: Spacing.xxl, alignItems: 'center', justifyContent: 'center' },
  fallback: { ...Typography.body.base, textAlign: 'center', paddingHorizontal: Spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    overflow: 'hidden',
  },
  posterImg: { width: '100%', height: '100%' },
  posterFallback: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xs },
  posterTitle: { ...Typography.body.xs, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onListStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 3,
    alignItems: 'center',
  },
  onListText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});
