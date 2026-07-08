import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator, Keyboard, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';
import type { FirstTake, ReviewVisibility } from '@/lib/database.types';
import { LikeButton } from '@/components/like-button';
import { CommentThread } from '@/components/comments/comment-thread';
import { EditedBadge } from '@/components/edited-badge';
import { ContentContainer } from '@/components/content-container';
import ViewShot from 'react-native-view-shot';
import { ShareableFirstTakeCard } from '@/components/share/shareable-first-take-card';
import { captureCard, shareFirstTake, shareFirstTakeUrl } from '@/lib/share-service';
import { analytics } from '@/lib/analytics';
import { FirstTakeModal } from '@/components/first-take-modal';
import { updateFirstTake, deleteFirstTake } from '@/lib/first-take-service';
import { canEditPost, isEditWindowClosedError, EDIT_WINDOW_CLOSED_MESSAGE } from '@/lib/edit-window';
import { useSocialEditingEnabled } from '@/hooks/use-social-editing';
import { hapticImpact } from '@/lib/haptics';
import { ActionSheet } from '@/components/ui/action-sheet';
import Toast from 'react-native-toast-message';

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
  // PS-12 (D1): every edit affordance is gated behind the `social_editing` flag.
  const socialEditingEnabled = useSocialEditingEnabled();

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
  const [isSharing, setIsSharing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const queryClient = useQueryClient();

  // Reviewer profile for the share card
  const { data: reviewerProfile } = useQuery({
    queryKey: ['profile', firstTake?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username, avatar_url')
        .eq('id', firstTake!.user_id)
        .single();
      return data;
    },
    enabled: !!firstTake,
    staleTime: 5 * 60 * 1000,
  });

  const handleShare = useCallback(async () => {
    if (!firstTake || isSharing) return;
    setIsSharing(true);
    try {
      if (Platform.OS === 'web') {
        await shareFirstTakeUrl(firstTake.id, firstTake.movie_title);
      } else {
        const imageUri = await captureCard(viewShotRef);
        await shareFirstTake(firstTake.id, imageUri, firstTake.movie_title);
      }
      analytics.track('social:share', { content_type: 'first_take', tmdb_id: firstTake.tmdb_id });
    } catch (err: any) {
      if (err.message !== 'User cancelled') {
        Alert.alert('Share failed', err.message || 'Could not share First Take');
      }
    } finally {
      setIsSharing(false);
    }
  }, [firstTake, isSharing]);

  const isOwn = !!user && !!firstTake && firstTake.user_id === user.id;
  const needsFollowCheck =
    !!firstTake && firstTake.visibility === 'followers_only' && !isOwn;

  // PS-12 edit path: update an existing First Take through the same service the
  // create flow uses. The service stamps `edited_at` on content change and
  // re-throws `edit_window_closed` when the DB grace-window trigger rejects it.
  const updateMutation = useMutation({
    mutationFn: (updates: {
      quoteText: string;
      isSpoiler: boolean;
      rating: number | null;
      visibility: ReviewVisibility;
    }) => updateFirstTake(firstTake!.id, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(['firstTake', id], updated);
      queryClient.invalidateQueries({ queryKey: ['firstTake', updated.user_id, updated.tmdb_id, updated.media_type] });
      queryClient.invalidateQueries({ queryKey: ['first-takes', updated.user_id] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });

  // PS-12 (D2): the editor OPENS even when the post is locked — only the CONTENT
  // fields are disabled inside (visibility stays editable). `contentLocked` is
  // derived from `canEditPost`. The DB grace-window trigger remains the real
  // guarantee; `isEditWindowClosedError` in handleEditSubmit is the race
  // fallback if a save is rejected.
  const handleEditPress = () => {
    if (!firstTake) return;
    hapticImpact();
    setShowEditModal(true);
  };

  const handleEditSubmit = async (data: {
    rating: number | null;
    quoteText: string;
    isSpoiler: boolean;
    visibility: ReviewVisibility;
  }) => {
    if (!firstTake) return;
    try {
      await updateMutation.mutateAsync({
        quoteText: data.quoteText,
        isSpoiler: data.isSpoiler,
        rating: data.rating,
        visibility: data.visibility,
      });
      setShowEditModal(false);
    } catch (err) {
      if (isEditWindowClosedError(err)) {
        setShowEditModal(false);
        Alert.alert('Cannot edit', EDIT_WINDOW_CLOSED_MESSAGE);
      } else {
        Alert.alert('Error', 'Failed to save your First Take. Please try again.');
      }
    }
  };

  // Delete path: deletion is table stakes for an owner, so it is NOT gated by the
  // `social_editing` flag (unlike edit). RLS enforces owner-only deletes server-side.
  const deleteMutation = useMutation({
    mutationFn: () => deleteFirstTake(firstTake!.id),
    onSuccess: () => {
      if (firstTake) {
        queryClient.invalidateQueries({ queryKey: ['firstTake', firstTake.user_id, firstTake.tmdb_id, firstTake.media_type] });
      }
      queryClient.invalidateQueries({ queryKey: ['first-takes', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profileStats', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });

  const handleDeletePress = () => {
    if (!firstTake) return;
    Alert.alert(
      'Delete this First Take?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync();
              // Deep-link cold starts land here as the stack root (notification
              // taps) — back() would no-op and strand the user on the deleted
              // take. Same canGoBack guard as notifications.tsx.
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/feed');
              }
              Toast.show({ type: 'success', text1: 'First Take deleted' });
            } catch {
              Toast.show({ type: 'error', text1: 'Failed to delete First Take' });
            }
          },
        },
      ]
    );
  };

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
            {isOwn || firstTake.visibility === 'public' ? (
              <View style={styles.topBarActions}>
                {firstTake.visibility === 'public' && (
                  <Pressable onPress={handleShare} disabled={isSharing} hitSlop={8}>
                    {isSharing ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name="share-outline" size={24} color={colors.text} />
                    )}
                  </Pressable>
                )}
                {/* PS-12: the owner's edit/delete actions live behind a "⋯" menu.
                    Edit stays gated by `social_editing` (opens the content-locked
                    editor — visibility still editable when locked); Delete is
                    always offered on own posts. Non-owners get no menu here. */}
                {isOwn && (
                  <Pressable
                    onPress={() => setMenuVisible(true)}
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={{ width: 28 }} />
            )}
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
                  Posted {formatRelativeTime(firstTake.created_at ?? '')}
                </Text>
                <View style={styles.editedRow}>
                  <EditedBadge editedAt={firstTake.edited_at} createdAt={firstTake.created_at} />
                </View>
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
                initialLikeCount={firstTake.like_count ?? undefined}
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

        {/* Off-screen share card for capture (native only, public only) */}
        {Platform.OS !== 'web' && firstTake.visibility === 'public' && (
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1 }}
            style={styles.offScreen}
          >
            <ShareableFirstTakeCard
              movieTitle={firstTake.movie_title}
              posterPath={firstTake.poster_path}
              rating={firstTake.rating}
              reactionEmoji={firstTake.reaction_emoji}
              quoteText={firstTake.quote_text}
              reviewerName={reviewerProfile?.full_name || reviewerProfile?.username || 'PocketStubs User'}
              reviewerAvatar={reviewerProfile?.avatar_url ?? null}
              isRewatch={firstTake.is_rewatch ?? undefined}
            />
          </ViewShot>
        )}

        {/* Owner "⋯" menu — Edit (flag-gated) + Delete (always). */}
        {isOwn && (
          <ActionSheet
            visible={menuVisible}
            onClose={() => setMenuVisible(false)}
            options={[
              ...(socialEditingEnabled
                ? [{ label: 'Edit', onPress: handleEditPress }]
                : []),
              { label: 'Delete', onPress: handleDeletePress, destructive: true },
            ]}
          />
        )}

        {/* Edit modal — own First Takes only, behind the social_editing flag.
            When the post is locked, only content is disabled; visibility stays
            editable (PS-12 D2). */}
        {isOwn && socialEditingEnabled && (
          <FirstTakeModal
            visible={showEditModal}
            onClose={() => setShowEditModal(false)}
            onSubmit={handleEditSubmit}
            movieTitle={firstTake.movie_title}
            moviePosterUrl={posterUri ?? undefined}
            isSubmitting={updateMutation.isPending}
            isEditing
            contentLocked={!canEditPost(firstTake)}
            initialValues={{
              rating: firstTake.rating,
              quoteText: firstTake.quote_text,
              isSpoiler: firstTake.is_spoiler ?? false,
              visibility: firstTake.visibility as ReviewVisibility,
            }}
          />
        )}
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
    topBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
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
    editedRow: {
      marginTop: Spacing.xs,
      alignSelf: 'flex-start',
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
    offScreen: {
      position: 'absolute',
      left: -9999,
      top: -9999,
    },
  });
}
