import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';
import type { Review } from '@/lib/database.types';
import { LikeButton } from '@/components/like-button';

function getRatingColor(rating: number, tintColor: string): string {
  if (rating >= 8) return '#22C55E';
  if (rating >= 6) return '#EAB308';
  return tintColor;
}

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();

  const { data: review, isLoading } = useQuery({
    queryKey: ['review', id],
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
  });

  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const isOwnReview = !!user && !!review && review.user_id === user.id;
  const needsFollowCheck =
    !!review && review.visibility === 'followers_only' && !isOwnReview;

  const { data: followsData, isLoading: followsLoading } = useQuery({
    queryKey: ['followCheck', user?.id, review?.user_id],
    queryFn: async () => {
      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', user!.id)
        .eq('following_id', review!.user_id);
      return { isFollowing: (count ?? 0) > 0 };
    },
    enabled: needsFollowCheck && !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || (needsFollowCheck && followsLoading)) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (!review) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>Review</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Text style={styles.notFoundText}>Review not found</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Permission check: private review not owned by viewer
  if (review.visibility === 'private' && !isOwnReview) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>Review</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.notFoundText, { marginTop: Spacing.md }]}>
              This review is private
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Permission check: followers-only review and viewer doesn't follow the author
  if (
    review.visibility === 'followers_only' &&
    !isOwnReview &&
    followsData &&
    !followsData.isFollowing
  ) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>Review</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.notFoundText, { marginTop: Spacing.md }]}>
              This review is only visible to followers
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const posterUri = review.poster_path
    ? getTMDBImageUrl(review.poster_path, 'w185')
    : undefined;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>Review</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Movie Info Section */}
            <View style={styles.movieInfoRow}>
              {posterUri ? (
                <Image
                  source={{ uri: posterUri }}
                  style={styles.poster}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Ionicons name="film-outline" size={32} color={colors.textTertiary} />
                </View>
              )}

              <View style={styles.movieInfoText}>
                <Text style={styles.movieTitle} numberOfLines={2}>
                  {review.movie_title}
                </Text>
                <Text style={styles.timeText}>
                  {formatRelativeTime(review.created_at)}
                </Text>
              </View>

              <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(review.rating, colors.tint) }]}>
                <Text style={styles.ratingText}>{review.rating}</Text>
              </View>
            </View>

            {/* Review Title */}
            <Text style={styles.reviewTitle}>{review.title}</Text>

            {/* Spoiler Warning Banner */}
            {review.is_spoiler && !spoilerRevealed && (
              <View style={styles.spoilerBanner}>
                <Ionicons name="warning-outline" size={18} color="#D97706" />
                <Text style={styles.spoilerBannerText}>
                  This review contains spoilers
                </Text>
              </View>
            )}

            {/* Review Text */}
            {review.is_spoiler && !spoilerRevealed ? (
              <View style={{ position: 'relative', marginTop: Spacing.md }}>
                <Text style={[styles.reviewText, { marginTop: 0, opacity: 0.05 }]}>
                  {review.review_text}
                </Text>
                <View style={styles.spoilerOverlay}>
                  <Ionicons name="eye-off-outline" size={28} color={colors.textSecondary} />
                  <Text style={styles.spoilerOverlayText}>
                    Review text hidden
                  </Text>
                  <Pressable
                    style={styles.revealButton}
                    onPress={() => setSpoilerRevealed(true)}
                  >
                    <Text style={styles.revealButtonText}>Reveal Spoilers</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.reviewText}>{review.review_text}</Text>
            )}

            {/* Metadata Pills */}
            {(review.is_rewatch || review.is_spoiler) && (
              <View style={styles.pillsRow}>
                {review.is_rewatch && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>Rewatch</Text>
                  </View>
                )}
                {review.is_spoiler && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>Spoiler</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.likeRow}>
              <LikeButton
                targetType="review"
                targetId={review.id}
                initialLikeCount={review.like_count}
                size="md"
              />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      ...(Platform.OS === 'web' ? { maxWidth: 768, width: '100%', alignSelf: 'center' as const } : {}),
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 48,
      paddingHorizontal: Spacing.md,
    },
    topBarTitle: {
      ...Typography.body.lg,
      fontWeight: '600',
      color: colors.text,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.xxl,
    },
    movieInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    poster: {
      width: 80,
      height: 120,
      borderRadius: BorderRadius.sm,
    },
    posterPlaceholder: {
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    movieInfoText: {
      flex: 1,
      marginLeft: Spacing.md,
      marginRight: Spacing.md,
    },
    movieTitle: {
      ...Typography.body.lg,
      fontWeight: '700',
      color: colors.text,
    },
    timeText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
    },
    ratingBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.tint,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ratingText: {
      fontFamily: Fonts.outfit.extrabold,
      fontSize: 24,
      color: '#ffffff',
    },
    reviewTitle: {
      ...Typography.body.lg,
      fontWeight: '700',
      color: colors.text,
      marginTop: Spacing.lg,
    },
    reviewText: {
      ...Typography.body.base,
      color: colors.text,
      lineHeight: 24,
      marginTop: Spacing.md,
    },
    pillsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
    },
    pill: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    pillText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    notFoundText: {
      ...Typography.body.base,
      color: colors.textSecondary,
    },
    spoilerBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: 'rgba(217, 119, 6, 0.1)',
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.md,
    },
    spoilerBannerText: {
      ...Typography.body.sm,
      fontWeight: '600',
      color: '#D97706',
    },
    spoilerOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      minHeight: 120,
    },
    spoilerOverlayText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    revealButton: {
      backgroundColor: colors.tint,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.xs,
    },
    revealButtonText: {
      ...Typography.body.sm,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    likeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
  });
}
