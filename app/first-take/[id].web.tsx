import { Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Fonts, FontSizes } from '@/constants/theme';
import { ShareableFirstTakeCard } from '@/components/share/shareable-first-take-card';
import { GetPocketStubsCTA } from '@/components/share/get-pocketstubs-cta';
import type { FirstTake } from '@/lib/database.types';

/**
 * Web fallback page for a shared first take: pocketstubs.com/first-take/{id}.
 *
 * Platform-specific sibling of app/first-take/[id].tsx — expo-router resolves
 * this `.web.tsx` file on web and the full native first-take screen on
 * iOS/Android. This page is for unauthenticated recipients of a shared link,
 * so there is no auth/follow logic: only PUBLIC first takes render; anything
 * else (private, followers-only, missing, or an RLS-denied read) resolves to
 * the "not available" state. See docs/PRD-social-share.md (Sprint 3).
 */
export default function FirstTakeWebFallback() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: firstTake,
    isLoading: firstTakeLoading,
    isError,
  } = useQuery({
    queryKey: ['first-take-web', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('first_takes')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as FirstTake;
    },
    enabled: !!id,
    retry: false,
  });

  const isPublic = firstTake?.visibility === 'public';

  const { data: reviewerProfile } = useQuery({
    queryKey: ['profile-web', firstTake?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username, avatar_url')
        .eq('id', firstTake!.user_id)
        .single();
      return data;
    },
    enabled: !!firstTake && isPublic,
    staleTime: 5 * 60 * 1000,
  });

  if (firstTakeLoading) {
    return (
      <Page>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </Page>
    );
  }

  // Not found, RLS-denied, or non-public visibility → generic unavailable state.
  // We intentionally do not distinguish private/followers-only from missing,
  // so the page never leaks the existence of a non-public first take.
  if (isError || !firstTake || !isPublic) {
    return (
      <Page>
        <Stack.Screen options={{ title: 'First Take unavailable', headerShown: false }} />
        <Text style={styles.unavailableTitle}>This First Take isn&apos;t available</Text>
        <Text style={styles.unavailableBody}>
          It may have been removed or set to private.
        </Text>
        <GetPocketStubsCTA utmContent="firsttake" />
      </Page>
    );
  }

  return (
    <Page>
      <Stack.Screen options={{ title: firstTake.movie_title, headerShown: false }} />
      <ShareableFirstTakeCard
        movieTitle={firstTake.movie_title}
        posterPath={firstTake.poster_path}
        rating={firstTake.rating}
        reactionEmoji={firstTake.reaction_emoji}
        quoteText={firstTake.quote_text}
        reviewerName={
          reviewerProfile?.full_name || reviewerProfile?.username || 'PocketStubs User'
        }
        reviewerAvatar={reviewerProfile?.avatar_url ?? null}
        isRewatch={firstTake.is_rewatch ?? undefined}
      />
      <GetPocketStubsCTA utmContent="firsttake" />
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
