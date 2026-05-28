import { Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Fonts, FontSizes } from '@/constants/theme';
import { ShareableReviewCard } from '@/components/share/shareable-review-card';
import { GetPocketStubsCTA } from '@/components/share/get-pocketstubs-cta';
import type { Review } from '@/lib/database.types';

/**
 * Web fallback page for a shared review: pocketstubs.com/review/{id}.
 *
 * Platform-specific sibling of app/review/[id].tsx — expo-router resolves this
 * `.web.tsx` file on web and the plain `.tsx` (the full native review screen)
 * on iOS/Android. This page is for unauthenticated recipients of a shared
 * link, so there is no auth/follow logic: only PUBLIC reviews render; anything
 * else (private, followers-only, missing, or an RLS-denied read) resolves to
 * the "not available" state. See docs/PRD-social-share.md (Sprint 3).
 */
export default function ReviewWebFallback() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: review,
    isLoading: reviewLoading,
    isError,
  } = useQuery({
    queryKey: ['review-web', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Review;
    },
    enabled: !!id,
    retry: false,
  });

  const isPublic = review?.visibility === 'public';

  // Reviewer profile for the card. Only fetched once we have a public review.
  const { data: reviewerProfile } = useQuery({
    queryKey: ['profile-web', review?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username, avatar_url')
        .eq('id', review!.user_id)
        .single();
      return data;
    },
    enabled: !!review && isPublic,
    staleTime: 5 * 60 * 1000,
  });

  if (reviewLoading) {
    return (
      <Page>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </Page>
    );
  }

  // Not found, RLS-denied, or non-public visibility → generic unavailable state.
  // We intentionally do not distinguish private/followers-only from missing,
  // so the page never leaks the existence of a non-public review.
  if (isError || !review || !isPublic) {
    return (
      <Page>
        <Stack.Screen options={{ title: 'Review unavailable', headerShown: false }} />
        <Text style={styles.unavailableTitle}>This review isn&apos;t available</Text>
        <Text style={styles.unavailableBody}>
          It may have been removed or set to private.
        </Text>
        <GetPocketStubsCTA utmContent="review" />
      </Page>
    );
  }

  return (
    <Page>
      <Stack.Screen options={{ title: review.movie_title, headerShown: false }} />
      <ShareableReviewCard
        movieTitle={review.movie_title}
        posterPath={review.poster_path}
        rating={review.rating}
        reviewTitle={review.title}
        reviewText={review.review_text}
        reviewerName={
          reviewerProfile?.full_name || reviewerProfile?.username || 'PocketStubs User'
        }
        reviewerAvatar={reviewerProfile?.avatar_url ?? null}
        isRewatch={review.is_rewatch}
      />
      <GetPocketStubsCTA utmContent="review" />
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
