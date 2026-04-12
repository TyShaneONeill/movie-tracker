import { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator, Keyboard } from 'react-native';
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
import type { FirstTake } from '@/lib/database.types';
import { LikeButton } from '@/components/like-button';
import { CommentThread } from '@/components/comments/comment-thread';
import { ContentContainer } from '@/components/content-container';

function getRatingColor(rating: number, tintColor: string): string {
  if (rating >= 8) return '#22C55E';
  if (rating >= 6) return '#EAB308';
  return tintColor;
}

export default function FirstTakeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();

  const { data: firstTake, isLoading } = useQuery({
    queryKey: ['firstTake', id],
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
  });

  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isOwn = !!user && !!firstTake && firstTake.user_id === user.id;
  const needsFollowCheck =
    !!firstTake && firstTake.visibility === 'followers_only' && !isOwn;

  const { data: followsData, isLoading: followsLoading } = useQuery({
    queryKey: ['followCheck', user?.id, firstTake?.user_id],
    queryFn: async () => {
      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', user!.id)
        .eq('following_id', firstTake!.user_id);
      return { isFollowing: (count ?? 0) > 0 };
    },
    enabled: needsFollowCheck && !!user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const event = 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

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

  if (!firstTake) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>First Take</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Text style={styles.notFoundText}>First Take not found</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (firstTake.visibility === 'private' && !isOwn) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>First Take</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.notFoundText, { marginTop: Spacing.md }]}>
              This First Take is private
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (
    firstTake.visibility === 'followers_only' &&
    !isOwn &&
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
            <Text style={styles.topBarTitle}>First Take</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.notFoundText, { marginTop: Spacing.md }]}>
              This First Take is only visible to followers
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const posterUri = firstTake.poster_path
    ? getTMDBImageUrl(firstTake.poster_path, 'w185')
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
            <Text style={styles.topBarTitle}>First Take</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
            <ContentContainer>
            {/* Movie Info */}
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
                  {firstTake.movie_title}
                </Text>
                <Text style={styles.timeText}>
                  {formatRelativeTime(firstTake.created_at ?? '')}
                </Text>
              </View>

              {firstTake.rating != null && firstTake.rating > 0 ? (
                <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(firstTake.rating, colors.tint) }]}>
                  <Text style={styles.ratingText}>{firstTake.rating}</Text>
                </View>
              ) : (
                <Text style={styles.emoji}>{firstTake.reaction_emoji}</Text>
              )}
            </View>

            {/* Quote */}
            {firstTake.is_spoiler && !spoilerRevealed ? (
              <Pressable
                style={styles.spoilerCard}
                onPress={() => setSpoilerRevealed(true)}
                accessibilityRole="button"
                accessibilityLabel="Reveal spoiler content"
              >
                <View style={styles.spoilerCardInner}>
                  <Ionicons name="eye-off-outline" size={22} color={colors.textTertiary} />
                  <Text style={styles.spoilerCardTitle}>Spoiler-protected</Text>
                  <Text style={styles.spoilerCardHint}>Tap to reveal</Text>
                </View>
              </Pressable>
            ) : (
              <Text style={styles.quoteText}>
                &ldquo;{firstTake.quote_text}&rdquo;
              </Text>
            )}

            {/* Rewatch pill */}
            {firstTake.is_rewatch && (
              <View style={styles.pillsRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Rewatch</Text>
                </View>
              </View>
            )}

            {/* Engagement Bar */}
            <View style={styles.engagementBar}>
              <LikeButton
                targetType="first_take"
                targetId={firstTake.id}
                initialLikeCount={firstTake.like_count}
                size="md"
              />
              <View style={styles.engagementDivider} />
              <View style={styles.engagementMeta}>
                <Ionicons name="chatbubble-outline" size={18} color={colors.textTertiary} />
                <Text style={styles.engagementMetaText}>
                  {firstTake.comment_count ?? 0}
                </Text>
              </View>
            </View>

            {/* Comments */}
            <CommentThread targetType="first_take" targetId={firstTake.id} />
            </ContentContainer>
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
      paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
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
      justifyContent: 'center',
      alignItems: 'center',
    },
    ratingText: {
      fontFamily: Fonts.outfit.extrabold,
      fontSize: 24,
      color: '#ffffff',
    },
    emoji: {
      fontSize: 36,
    },
    quoteText: {
      ...Typography.body.base,
      color: colors.text,
      fontStyle: 'italic',
      lineHeight: 24,
      marginTop: Spacing.lg,
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
    spoilerCard: {
      marginTop: Spacing.lg,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
    spoilerCardInner: {
      alignItems: 'center',
      gap: 6,
    },
    spoilerCardTitle: {
      ...Typography.body.sm,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 2,
    },
    spoilerCardHint: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    engagementBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.lg,
      paddingTop: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: Spacing.lg,
    },
    engagementDivider: {
      width: 1,
      height: 18,
      backgroundColor: colors.border,
    },
    engagementMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    engagementMetaText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
    },
  });
}
