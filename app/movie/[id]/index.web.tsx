import { Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useMovieDetail } from '@/hooks/use-movie-detail';
import { Colors, Spacing, Fonts, FontSizes } from '@/constants/theme';
import { DiscoveryMovieCard } from '@/components/share/discovery-movie-card';
import { GetPocketStubsCTA } from '@/components/share/get-pocketstubs-cta';

/**
 * Web fallback page for a shared movie: pocketstubs.com/movie/{id}.
 *
 * Platform-specific sibling of app/movie/[id]/index.tsx — expo-router resolves
 * this `.web.tsx` file on web and the full native movie screen on iOS/Android.
 * This is the install-CTA landing page for recipients of a shared movie link,
 * so it shows the same discovery card the sharer generated (TMDB poster +
 * title, no user data) plus the "Get PocketStubs" CTA. See
 * docs/PRD-social-share.md (Sprint 3).
 */
export default function MovieWebFallback() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { movie, isLoading, isError } = useMovieDetail({ movieId: id! });

  if (isLoading) {
    return (
      <Page>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </Page>
    );
  }

  if (isError || !movie) {
    return (
      <Page>
        <Stack.Screen options={{ title: 'Title unavailable', headerShown: false }} />
        <Text style={styles.unavailableTitle}>This title isn&apos;t available</Text>
        <Text style={styles.unavailableBody}>
          It may have been removed or the link is incorrect.
        </Text>
        <GetPocketStubsCTA utmContent="movie" />
      </Page>
    );
  }

  const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : undefined;

  return (
    <Page>
      <Stack.Screen options={{ title: movie.title, headerShown: false }} />
      <DiscoveryMovieCard
        movieTitle={movie.title}
        posterPath={movie.poster_path}
        releaseYear={releaseYear}
        tagline={movie.tagline || undefined}
        shareUrl={`pocketstubs.com/movie/${movie.id}`}
      />
      <GetPocketStubsCTA utmContent="movie" />
    </Page>
  );
}

/** Centered, dark, scrollable page chrome shared by every state above. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
  },
  unavailableTitle: {
    fontFamily: Fonts.outfit.bold,
    fontSize: FontSizes['2xl'],
    color: Colors.dark.text,
    textAlign: 'center',
  },
  unavailableBody: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.base,
    lineHeight: 22,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
