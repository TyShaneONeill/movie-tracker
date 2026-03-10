import { useState, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, View, Pressable, Image, RefreshControl, ListRenderItemInfo, ScrollView, useWindowDimensions, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
    runOnJS,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/use-auth';
import { useAchievements } from '@/hooks/use-achievements';
import { GuestSignInPrompt } from '@/components/guest-sign-in-prompt';
import { AchievementBadge } from '@/components/achievement-badge';
import { ThemedText } from '@/components/themed-text';
import { CollectionGridCard } from '@/components/cards/collection-grid-card';
import { ListCard } from '@/components/cards/list-card';
import { FirstTakeCard } from '@/components/cards/first-take-card';
import { ReviewCard } from '@/components/cards/review-card';
import { CreateListModal } from '@/components/modals/create-list-modal';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useUserLists } from '@/hooks/use-user-lists';
import { useListMutations } from '@/hooks/use-list-mutations';
import { useFirstTakes } from '@/hooks/use-first-takes';
import { useUserReviews, type ReviewSortOption, type ReviewMediaFilter } from '@/hooks/use-user-reviews';
import { useProfile } from '@/hooks/use-profile';
import { useNotifications } from '@/hooks/use-notifications';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useUserTvShows } from '@/hooks/use-user-tv-shows';
import { MOCK_USER } from '@/lib/mock-data/users';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie, GroupedUserMovie, UserTvShow } from '@/lib/database.types';

type TabType = 'collection' | 'first-takes' | 'reviews' | 'lists';

// Constants for header animation
const HEADER_MAX_HEIGHT = 350; // Full header height (avatar, name, bio, follower stats, achievements)
const HEADER_MIN_HEIGHT = 0; // Collapsed header height
const HEADER_SCROLL_DISTANCE = 180; // Scroll distance to fully collapse

// Grid layout constants
const COLUMN_COUNT = 3;
const GRID_GAP = Spacing.sm;

export default function ProfileScreen() {
    const { effectiveTheme } = useTheme();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<TabType>('collection');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [stickyBarVisible, setStickyBarVisible] = useState(false);
    const scrollViewRef = useRef<Animated.ScrollView>(null);
    const flatListRef = useRef<Animated.FlatList<GroupedUserMovie>>(null);

    const colors = Colors[effectiveTheme];
    const { width: screenWidth } = useWindowDimensions();

    const MAX_APP_WIDTH = 768;
    const cardWidth = useMemo(() => {
        const effectiveWidth = Platform.OS === 'web' ? Math.min(screenWidth, MAX_APP_WIDTH) : screenWidth;
        const availableWidth = effectiveWidth - (Spacing.lg * 2);
        return (availableWidth - (GRID_GAP * (COLUMN_COUNT - 1))) / COLUMN_COUNT;
    }, [screenWidth]);

    // Animated scroll value
    const scrollY = useSharedValue(0);

    // Fetch user profile and stats
    const { profile, stats, refetch: refetchProfile, refetchStats } = useProfile();

    // Fetch notification unread count
    const { unreadCount } = useNotifications();

    // Fetch user preferences (default collection view)
    const { preferences } = useUserPreferences();

    // Fetch watched TV shows for collection
    const {
        shows: watchedTvShows,
        isLoading: tvShowsLoading,
        refetch: refetchTvShows,
    } = useUserTvShows('watched');

    const showingTv = preferences?.defaultCollectionView === 'tv';

    // Fetch achievements
    const { progress: achievementProgress, refetch: refetchAchievements } = useAchievements();

    // Fetch watched movies for collection (groupedMovies dedupes by tmdb_id)
    const {
        groupedMovies,
        isLoading,
        isError,
        refetch,
    } = useUserMovies('watched');

    // Fetch watchlist and watching movies for Lists tab
    const { movies: watchlistMovies } = useUserMovies('watchlist');
    const { movies: watchingMovies } = useUserMovies('watching');

    // Fetch user's lists
    const {
        data: userLists,
        isLoading: listsLoading,
        isError: listsError,
        refetch: refetchLists,
    } = useUserLists();

    const { createList } = useListMutations();

    // Fetch user's first takes
    const {
        data: firstTakes,
        isLoading: takesLoading,
        isError: takesError,
        refetch: refetchTakes,
    } = useFirstTakes();

    // Fetch user's reviews
    const {
        reviews: userReviews,
        isLoading: reviewsLoading,
        isError: reviewsError,
        refetch: refetchReviews,
    } = useUserReviews({ userId: user?.id, viewerId: user?.id, enabled: !!user });
    const [reviewSort, setReviewSort] = useState<ReviewSortOption>('recent');
    const [reviewFilter, setReviewFilter] = useState<ReviewMediaFilter>('all');

    // Apply sort/filter to reviews
    const filteredReviews = useMemo(() => {
        let list = [...userReviews];
        if (reviewFilter !== 'all') {
            list = list.filter(r => r.media_type === reviewFilter);
        }
        switch (reviewSort) {
            case 'popular':
                list.sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));
                break;
            case 'highest':
                list.sort((a, b) => b.rating - a.rating);
                break;
            case 'lowest':
                list.sort((a, b) => a.rating - b.rating);
                break;
            case 'recent':
            default:
                // Already sorted by created_at desc from the query
                break;
        }
        return list;
    }, [userReviews, reviewSort, reviewFilter]);

    // Scroll handler for tracking scroll position (native only needs the
    // sticky-bar visibility bridge; web uses CSS position:sticky instead).
    const isWeb = Platform.OS === 'web';
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
            if (!isWeb) {
                const isVisible = event.contentOffset.y >= HEADER_SCROLL_DISTANCE * 0.8;
                runOnJS(setStickyBarVisible)(isVisible);
            }
        },
    });

    // Animated style for collapsible header (native only — on web the header
    // scrolls away naturally to avoid expensive per-frame height reflows).
    const headerAnimatedStyle = useAnimatedStyle(() => {
        if (Platform.OS === 'web') return {};
        const height = interpolate(
            scrollY.value,
            [0, HEADER_SCROLL_DISTANCE],
            [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
            Extrapolation.CLAMP
        );
        const opacity = interpolate(
            scrollY.value,
            [0, HEADER_SCROLL_DISTANCE * 0.7],
            [1, 0],
            Extrapolation.CLAMP
        );
        return {
            height,
            opacity,
            overflow: 'hidden' as const,
        };
    });

    // Animated style for sticky tab bar overlay (appears when header collapses)
    const stickyTabBarStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollY.value,
            [HEADER_SCROLL_DISTANCE * 0.8, HEADER_SCROLL_DISTANCE],
            [0, 1],
            Extrapolation.CLAMP
        );
        const translateY = interpolate(
            scrollY.value,
            [HEADER_SCROLL_DISTANCE * 0.8, HEADER_SCROLL_DISTANCE],
            [-10, 0],
            Extrapolation.CLAMP
        );
        return {
            opacity,
            transform: [{ translateY }],
        };
    });

    // Handle tab change - scroll to top and expand header
    const handleTabChange = useCallback((tab: TabType) => {
        // Reset scroll position immediately to prevent sticky header duplication
        scrollY.value = 0;
        setActiveTab(tab);
        // Scroll to top (on web all tabs use ScrollView; on native collection uses FlatList)
        if (!isWeb && tab === 'collection') {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        } else {
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }
    }, [scrollY, isWeb]);

    // Handle refresh
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        // Scroll to top first to show the header
        if (!isWeb && activeTab === 'collection') {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        } else {
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }

        await Promise.all([
            refetchProfile(),
            refetchStats(),
            refetch(),
            refetchTvShows(),
            refetchLists(),
            refetchTakes(),
            refetchReviews(),
            refetchAchievements(),
        ]);
        setIsRefreshing(false);
    }, [isWeb, activeTab, refetchProfile, refetchStats, refetch, refetchTvShows, refetchLists, refetchTakes, refetchReviews, refetchAchievements]);

    const renderCollectionItem = useCallback(({ item }: ListRenderItemInfo<GroupedUserMovie>) => {
        const isAiPoster = item.display_poster === 'ai_generated' && !!item.ai_poster_url;
        return (
            <CollectionGridCard
                posterUrl={
                    isAiPoster
                        ? item.ai_poster_url!
                        : item.poster_path
                            ? getTMDBImageUrl(item.poster_path, 'w342') ?? ''
                            : ''
                }
                isAiPoster={isAiPoster}
                journeyCount={item.journeyCount}
                onPress={() => router.push(`/journey/movie/${item.tmdb_id}`)}
                style={{ width: cardWidth }}
            />
        );
    }, [cardWidth]);

    const renderTvCollectionItem = useCallback(({ item }: ListRenderItemInfo<UserTvShow>) => {
        return (
            <CollectionGridCard
                posterUrl={
                    item.poster_path
                        ? getTMDBImageUrl(item.poster_path, 'w342') ?? ''
                        : ''
                }
                isAiPoster={false}
                journeyCount={0}
                onPress={() => router.push(`/tv/${item.tmdb_id}`)}
                style={{ width: cardWidth }}
            />
        );
    }, [cardWidth]);

    const renderEmptyCollection = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name={showingTv ? 'tv-outline' : 'film-outline'} size={48} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                {showingTv ? 'No TV shows watched yet' : 'No movies yet'}
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {showingTv ? 'TV shows you mark as watched will appear here' : 'Movies you mark as watched will appear here'}
            </ThemedText>
        </View>
    );

    const renderLoadingSkeleton = () => (
        <View style={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, index) => (
                <View
                    key={index}
                    style={[styles.skeletonCard, { backgroundColor: colors.card }]}
                />
            ))}
        </View>
    );

    const renderErrorState = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                Something went wrong
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                We could not load your collection
            </ThemedText>
            <Pressable
                style={[styles.retryButton, { backgroundColor: colors.tint }]}
                onPress={() => refetch()}
            >
                <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
            </Pressable>
        </View>
    );

    // Lists tab render functions
    const renderListsSkeleton = () => (
        <View style={styles.listsSkeleton}>
            {Array.from({ length: 3 }).map((_, index) => (
                <View
                    key={index}
                    style={[styles.listSkeletonCard, { backgroundColor: colors.card }]}
                />
            ))}
        </View>
    );

    const renderListsError = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                Something went wrong
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                We could not load your lists
            </ThemedText>
            <Pressable
                style={[styles.retryButton, { backgroundColor: colors.tint }]}
                onPress={() => refetchLists()}
            >
                <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
            </Pressable>
        </View>
    );

    // Special list card component with adaptive poster grid
    const renderSpecialListCard = (
        title: string,
        movies: UserMovie[] | undefined,
        icon: keyof typeof Ionicons.glyphMap,
        onPress: () => void
    ) => {
        const posterUrls = (movies || [])
            .slice(0, 4)
            .map(m => m.poster_path ? getTMDBImageUrl(m.poster_path, 'w185') : null);
        const count = movies?.length || 0;

        const renderPosterGrid = () => {
            const validPosters = posterUrls.filter(url => url !== null);
            const movieCount = validPosters.length;

            if (movieCount === 0) {
                // Empty state
                return (
                    <View style={[styles.posterGridEmpty, { borderColor: colors.border }]}>
                        <Ionicons name={icon} size={24} color={colors.textSecondary} />
                    </View>
                );
            }

            if (movieCount === 1) {
                return (
                    <View style={styles.posterGridSingle}>
                        <ExpoImage
                            source={{ uri: validPosters[0]! }}
                            style={styles.posterImageSingle}
                            contentFit="cover"
                            transition={200}
                        />
                    </View>
                );
            }

            if (movieCount === 2) {
                return (
                    <View style={styles.posterGridTwo}>
                        {validPosters.map((url, idx) => (
                            <View key={idx} style={styles.posterCellHalf}>
                                <ExpoImage
                                    source={{ uri: url! }}
                                    style={styles.posterImage}
                                    contentFit="cover"
                                    transition={200}
                                />
                            </View>
                        ))}
                    </View>
                );
            }

            if (movieCount === 3) {
                return (
                    <View style={styles.posterGridThree}>
                        {validPosters.map((url, idx) => (
                            <View key={idx} style={styles.posterCellThird}>
                                <ExpoImage
                                    source={{ uri: url! }}
                                    style={styles.posterImage}
                                    contentFit="cover"
                                    transition={200}
                                />
                            </View>
                        ))}
                    </View>
                );
            }

            // 4 posters - 2x2 grid
            return (
                <View style={styles.posterGridFour}>
                    {posterUrls.slice(0, 4).map((url, idx) => (
                        <View key={idx} style={styles.posterCellQuarter}>
                            {url ? (
                                <ExpoImage
                                    source={{ uri: url }}
                                    style={styles.posterImage}
                                    contentFit="cover"
                                    transition={200}
                                />
                            ) : (
                                <View style={styles.posterImage} />
                            )}
                        </View>
                    ))}
                </View>
            );
        };

        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    styles.specialListCard,
                    { backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }
                ]}
            >
                <View style={styles.specialListHeader}>
                    <View style={styles.specialListTitleRow}>
                        <Ionicons name={icon} size={18} color={colors.tint} />
                        <ThemedText style={[styles.specialListTitle, { color: colors.text }]}>
                            {title}
                        </ThemedText>
                    </View>
                    <ThemedText style={[styles.specialListCount, { color: colors.textSecondary }]}>
                        {count} {count === 1 ? 'movie' : 'movies'}
                    </ThemedText>
                </View>
                {renderPosterGrid()}
            </Pressable>
        );
    };

    // First Takes tab render functions
    const renderFirstTakesEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                No first takes yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Share your thoughts right after watching a movie
            </ThemedText>
        </View>
    );

    const renderFirstTakesSkeleton = () => (
        <View style={styles.firstTakesSkeleton}>
            {Array.from({ length: 3 }).map((_, index) => (
                <View
                    key={index}
                    style={[styles.firstTakeSkeletonCard, { backgroundColor: colors.card }]}
                />
            ))}
        </View>
    );

    const renderFirstTakesError = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                Something went wrong
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                We could not load your first takes
            </ThemedText>
            <Pressable
                style={[styles.retryButton, { backgroundColor: colors.tint }]}
                onPress={() => refetchTakes()}
            >
                <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
            </Pressable>
        </View>
    );

    // Combined stat-tab configuration: each tab shows its count AND acts as navigation
    const TAB_CONFIG: { key: TabType; label: string; getCount: () => number }[] = [
        { key: 'collection', label: 'Watched', getCount: () => stats.watched + watchedTvShows.length },
        { key: 'first-takes', label: 'First Takes', getCount: () => stats.firstTakes },
        { key: 'reviews', label: 'Reviews', getCount: () => stats.reviews },
        { key: 'lists', label: 'Lists', getCount: () => stats.lists },
    ];

    // Combined stat-tab bar: shows count + label, acts as navigation
    const renderStatTabBar = () => (
        <>
            {TAB_CONFIG.map(({ key, label, getCount }) => {
                const isActive = activeTab === key;
                const count = getCount();
                return (
                    <Pressable
                        key={key}
                        onPress={() => handleTabChange(key)}
                        accessibilityRole="tab"
                        accessibilityLabel={`${label}, ${count}`}
                        accessibilityState={{ selected: isActive }}
                        style={({ pressed }) => [
                            styles.statTabItem,
                            isActive && styles.statTabItemActive,
                            isActive && { borderBottomColor: colors.tint },
                            { opacity: pressed ? 0.7 : 1 },
                        ]}
                    >
                        <ThemedText style={[
                            styles.statTabValue,
                            { color: isActive ? colors.text : colors.textSecondary }
                        ]}>
                            {count}
                        </ThemedText>
                        <ThemedText
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                            style={[
                                styles.statTabLabel,
                                { color: isActive ? colors.text : colors.textSecondary }
                            ]}
                        >
                            {label}
                        </ThemedText>
                    </Pressable>
                );
            })}
        </>
    );

    // Shared achievements row renderer
    const renderAchievementsRow = () => (
        <View style={styles.achievementsSection}>
            <View style={styles.achievementsHeader}>
                <ThemedText style={[styles.achievementsLabel, { color: colors.textSecondary }]}>
                    ACHIEVEMENTS
                </ThemedText>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.achievementsScrollContent}
            >
                {achievementProgress.map((p) => {
                    const currentLevelData = p.levels.find(l => l.level === p.currentLevel);
                    return (
                        <AchievementBadge
                            key={p.achievement.id}
                            icon={p.achievement.icon}
                            name={p.achievement.name}
                            unlocked={p.currentLevel > 0}
                            currentLevel={p.currentLevel}
                            maxLevel={p.maxLevel}
                            imageUrl={currentLevelData?.image_url}
                            onPress={() => router.push('/achievements')}
                        />
                    );
                })}
            </ScrollView>
        </View>
    );

    // ListHeaderComponent for FlatList (Collection tab)
    const renderCollectionListHeader = () => (
        <>
            {/* Collapsible Profile Header */}
            <Animated.View style={[styles.header, headerAnimatedStyle]}>
                <Image
                    source={{ uri: buildAvatarUrl(profile?.avatar_url, profile?.updated_at) || MOCK_USER.avatarUrl }}
                    style={[styles.avatar, { borderColor: colors.tint }]}
                />
                <ThemedText style={[styles.username, { color: colors.text }]}>
                    {profile?.full_name || MOCK_USER.name}
                </ThemedText>
                <ThemedText style={[styles.bio, { color: colors.textSecondary }]}>
                    {profile?.bio || MOCK_USER.bio}
                </ThemedText>
                {/* Follower/Following Stats */}
                <View style={styles.followStats}>
                    <Pressable
                        onPress={() => user && router.push(`/followers/${user.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`${profile?.followers_count ?? 0} Followers`}
                        style={({ pressed }) => [
                            styles.followStatItem,
                            { opacity: pressed ? 0.7 : 1 },
                        ]}
                    >
                        <ThemedText style={[styles.followStatValue, { color: colors.text }]}>
                            {profile?.followers_count ?? 0}
                        </ThemedText>
                        <ThemedText style={[styles.followStatLabel, { color: colors.textSecondary }]}>
                            Followers
                        </ThemedText>
                    </Pressable>
                    <View style={[styles.followStatDivider, { backgroundColor: colors.border }]} />
                    <Pressable
                        onPress={() => user && router.push(`/following/${user.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`${profile?.following_count ?? 0} Following`}
                        style={({ pressed }) => [
                            styles.followStatItem,
                            { opacity: pressed ? 0.7 : 1 },
                        ]}
                    >
                        <ThemedText style={[styles.followStatValue, { color: colors.text }]}>
                            {profile?.following_count ?? 0}
                        </ThemedText>
                        <ThemedText style={[styles.followStatLabel, { color: colors.textSecondary }]}>
                            Following
                        </ThemedText>
                    </Pressable>
                </View>
                {/* Achievements Row */}
                {renderAchievementsRow()}
            </Animated.View>

            {/* Combined Stat-Tab Bar */}
            <View style={[styles.statTabBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                {renderStatTabBar()}
            </View>
        </>
    );

    // Empty/loading/error component for FlatList
    const renderCollectionListEmpty = () => {
        if (showingTv ? tvShowsLoading : isLoading) {
            return <View style={styles.content}>{renderLoadingSkeleton()}</View>;
        }
        if (!showingTv && isError) {
            return <View style={styles.content}>{renderErrorState()}</View>;
        }
        return <View style={styles.content}>{renderEmptyCollection()}</View>;
    };

    // Render content for non-collection tabs (First Takes and Lists)
    const renderTabContent = () => {
        if (activeTab === 'first-takes') {
            if (takesLoading) {
                return renderFirstTakesSkeleton();
            }

            if (takesError) {
                return renderFirstTakesError();
            }

            if (!firstTakes?.length) {
                return renderFirstTakesEmpty();
            }

            return (
                <View style={styles.firstTakesContent}>
                    {firstTakes.map((take, index) => (
                        <View key={take.id}>
                            {index === 0 && (
                                <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                                    LATEST SNAPSHOT
                                </ThemedText>
                            )}
                            <FirstTakeCard
                                movieTitle={take.movie_title}
                                posterPath={take.poster_path}
                                emoji={take.reaction_emoji}
                                quote={take.quote_text}
                                rating={take.rating}
                                createdAt={take.created_at ?? ''}
                                isLatest={index === 0}
                                onPress={() => router.push(take.media_type === 'tv_show' ? `/tv/${take.tmdb_id}` : `/movie/${take.tmdb_id}`)}
                            />
                        </View>
                    ))}
                </View>
            );
        } else if (activeTab === 'reviews') {
            if (reviewsLoading) {
                return renderFirstTakesSkeleton();
            }

            if (reviewsError) {
                return (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
                        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                            Something went wrong
                        </ThemedText>
                        <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                            We could not load your reviews
                        </ThemedText>
                        <Pressable
                            style={[styles.retryButton, { backgroundColor: colors.tint }]}
                            onPress={() => refetchReviews()}
                        >
                            <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
                        </Pressable>
                    </View>
                );
            }

            if (!userReviews?.length) {
                return (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
                        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                            No reviews yet
                        </ThemedText>
                        <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                            Write a review from any movie page
                        </ThemedText>
                    </View>
                );
            }

            return (
                <View style={styles.firstTakesContent}>
                    {/* Sort & Filter Controls — two clean rows */}
                    <View style={styles.reviewControls}>
                        {/* Sort row — segmented control style */}
                        <View style={[styles.reviewSegment, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                            {(['recent', 'popular', 'highest', 'lowest'] as ReviewSortOption[]).map((option) => (
                                <Pressable
                                    key={option}
                                    style={[
                                        styles.reviewSegmentItem,
                                        reviewSort === option && { backgroundColor: colors.tint },
                                    ]}
                                    onPress={() => setReviewSort(option)}
                                >
                                    <ThemedText style={[styles.reviewSegmentText, { color: reviewSort === option ? '#ffffff' : colors.textSecondary }]}>
                                        {option === 'recent' ? 'Recent' : option === 'popular' ? 'Popular' : option === 'highest' ? 'Highest' : 'Lowest'}
                                    </ThemedText>
                                </Pressable>
                            ))}
                        </View>
                        {/* Media filter row — inline text toggles */}
                        <View style={styles.reviewMediaRow}>
                            {(['all', 'movie', 'tv_show'] as ReviewMediaFilter[]).map((option) => (
                                <Pressable
                                    key={option}
                                    style={styles.reviewMediaItem}
                                    onPress={() => setReviewFilter(option)}
                                >
                                    <ThemedText style={[
                                        styles.reviewMediaText,
                                        { color: reviewFilter === option ? colors.text : colors.textTertiary },
                                        reviewFilter === option && styles.reviewMediaTextActive,
                                    ]}>
                                        {option === 'all' ? 'All' : option === 'movie' ? 'Movies' : 'TV Shows'}
                                    </ThemedText>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {filteredReviews.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                                No reviews match this filter
                            </ThemedText>
                        </View>
                    ) : (
                        filteredReviews.map((review) => (
                            <ReviewCard
                                key={review.id}
                                id={review.id}
                                movieTitle={review.movie_title}
                                posterPath={review.poster_path}
                                title={review.title}
                                reviewText={review.review_text}
                                rating={review.rating}
                                isSpoiler={review.is_spoiler}
                                isRewatch={review.is_rewatch}
                                visibility={review.visibility}
                                createdAt={review.created_at}
                                onPress={() => router.push(`/review/${review.id}`)}
                            />
                        ))
                    )}
                </View>
            );
        } else {
            // Lists tab
            if (listsLoading) {
                return renderListsSkeleton();
            }

            if (listsError) {
                return renderListsError();
            }

            return (
                <View style={styles.listsContent}>
                    {/* Special built-in lists: Watchlist and Watching */}
                    <View style={styles.specialListsRow}>
                        {renderSpecialListCard(
                            'Watchlist',
                            watchlistMovies,
                            'bookmark-outline',
                            () => router.push('/list/watchlist')
                        )}
                        {renderSpecialListCard(
                            'Watching',
                            watchingMovies,
                            'play-circle-outline',
                            () => router.push('/list/watching')
                        )}
                    </View>

                    {/* User's custom lists */}
                    {userLists && userLists.length > 0 && (
                        <>
                            <ThemedText style={[styles.listsSection, { color: colors.textSecondary }]}>
                                YOUR LISTS
                            </ThemedText>
                            {userLists.map((list) => (
                                <ListCard
                                    key={list.id}
                                    title={list.name}
                                    description={list.description}
                                    movieCount={list.movie_count}
                                    posterUrls={list.movies.map(m =>
                                        m.poster_path ? getTMDBImageUrl(m.poster_path, 'w185') ?? '' : ''
                                    )}
                                    onPress={() => router.push(`/list/${list.id}`)}
                                    style={styles.listCard}
                                />
                            ))}
                        </>
                    )}

                    {/* Create List card */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.createListCard,
                            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                        ]}
                        onPress={() => setShowCreateModal(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Create a list"
                    >
                        <Ionicons name="add-circle-outline" size={28} color={colors.tint} />
                        <ThemedText style={[styles.createListText, { color: colors.tint }]}>
                            Create a List
                        </ThemedText>
                    </Pressable>

                    {/* See All Lists link */}
                    {userLists && userLists.length > 0 && (
                        <Pressable
                            style={({ pressed }) => [
                                styles.seeAllListsRow,
                                { opacity: pressed ? 0.7 : 1 },
                            ]}
                            onPress={() => router.push('/lists')}
                            accessibilityRole="button"
                            accessibilityLabel="See all lists"
                        >
                            <ThemedText style={[styles.seeAllListsText, { color: colors.tint }]}>
                                See All Lists
                            </ThemedText>
                            <Ionicons name="chevron-forward" size={18} color={colors.tint} />
                        </Pressable>
                    )}
                </View>
            );
        }
    };

    // Guest state - show sign in prompt
    if (!user) {
        return (
            <GuestSignInPrompt
                icon="person-circle-outline"
                title="Your Profile"
                message="Sign in to see your collection, watchlist, and first takes"
            />
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            {/* Header Icons - Fixed at top */}
            <View style={styles.headerIconsContainer}>
                {/* Notification Icon */}
                <Pressable
                    onPress={() => router.push('/notifications')}
                    accessibilityRole="button"
                    accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                    style={({ pressed }) => [styles.headerIconButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                    <Ionicons name="notifications-outline" size={24} color={colors.text} />
                    {unreadCount > 0 && (
                        <View style={[styles.notificationBadge, { backgroundColor: colors.tint }]}>
                            <ThemedText style={styles.notificationBadgeText}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </ThemedText>
                        </View>
                    )}
                </Pressable>

                {/* Settings Icon */}
                <Pressable
                    onPress={() => router.push('/settings')}
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                    style={({ pressed }) => [styles.headerIconButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Circle cx={12} cy={12} r={3} />
                        <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </Svg>
                </Pressable>
            </View>

            {/* Native collection tab uses FlatList for virtualized 3-column grid */}
            {!isWeb && activeTab === 'collection' && !showingTv && (
                <Animated.FlatList
                    ref={flatListRef}
                    data={isLoading || isError ? [] : groupedMovies}
                    renderItem={renderCollectionItem}
                    keyExtractor={(item) => `${item.tmdb_id}`}
                    numColumns={COLUMN_COUNT}
                    ListHeaderComponent={renderCollectionListHeader}
                    ListEmptyComponent={renderCollectionListEmpty}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    columnWrapperStyle={groupedMovies?.length && !isLoading && !isError ? styles.columnWrapper : undefined}
                    contentContainerStyle={styles.scrollContent}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    bounces={true}
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

            {/* Native collection tab - TV shows grid */}
            {!isWeb && activeTab === 'collection' && showingTv && (
                <Animated.FlatList
                    data={tvShowsLoading ? [] : watchedTvShows}
                    renderItem={renderTvCollectionItem}
                    keyExtractor={(item) => `${item.tmdb_id}`}
                    numColumns={COLUMN_COUNT}
                    ListHeaderComponent={renderCollectionListHeader}
                    ListEmptyComponent={renderCollectionListEmpty}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    columnWrapperStyle={watchedTvShows?.length && !tvShowsLoading ? styles.columnWrapper : undefined}
                    contentContainerStyle={styles.scrollContent}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    bounces={true}
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

            {/* Web uses ScrollView for ALL tabs (CSS position:sticky works in ScrollView
                but not inside FlatList). Native uses it for First Takes + Lists only. */}
            {(isWeb || activeTab !== 'collection') && (
                <Animated.ScrollView
                    ref={scrollViewRef}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    bounces={Platform.OS !== 'web'}
                    overScrollMode={Platform.OS === 'web' ? 'never' : 'auto'}
                    refreshControl={
                        Platform.OS !== 'web' ? (
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                tintColor={colors.tint}
                            />
                        ) : undefined
                    }
                >
                    {/* Profile Header */}
                    <Animated.View style={[styles.header, headerAnimatedStyle]}>
                        <Image
                            source={{ uri: buildAvatarUrl(profile?.avatar_url, profile?.updated_at) || MOCK_USER.avatarUrl }}
                            style={[styles.avatar, { borderColor: colors.tint }]}
                        />
                        <ThemedText style={[styles.username, { color: colors.text }]}>
                            {profile?.full_name || MOCK_USER.name}
                        </ThemedText>
                        <ThemedText style={[styles.bio, { color: colors.textSecondary }]}>
                            {profile?.bio || MOCK_USER.bio}
                        </ThemedText>
                        {/* Follower/Following Stats */}
                        <View style={styles.followStats}>
                            <Pressable
                                onPress={() => user && router.push(`/followers/${user.id}`)}
                                style={({ pressed }) => [
                                    styles.followStatItem,
                                    { opacity: pressed ? 0.7 : 1 },
                                ]}
                            >
                                <ThemedText style={[styles.followStatValue, { color: colors.text }]}>
                                    {profile?.followers_count ?? 0}
                                </ThemedText>
                                <ThemedText style={[styles.followStatLabel, { color: colors.textSecondary }]}>
                                    Followers
                                </ThemedText>
                            </Pressable>
                            <View style={[styles.followStatDivider, { backgroundColor: colors.border }]} />
                            <Pressable
                                onPress={() => user && router.push(`/following/${user.id}`)}
                                style={({ pressed }) => [
                                    styles.followStatItem,
                                    { opacity: pressed ? 0.7 : 1 },
                                ]}
                            >
                                <ThemedText style={[styles.followStatValue, { color: colors.text }]}>
                                    {profile?.following_count ?? 0}
                                </ThemedText>
                                <ThemedText style={[styles.followStatLabel, { color: colors.textSecondary }]}>
                                    Following
                                </ThemedText>
                            </Pressable>
                        </View>
                        {/* Achievements Row */}
                        {renderAchievementsRow()}
                    </Animated.View>

                    {/* Combined Stat-Tab Bar (CSS sticky on web) */}
                    <View style={[styles.statTabBar, { backgroundColor: colors.background, borderBottomColor: colors.border }, isWeb && styles.statTabBarSticky]}>
                        {renderStatTabBar()}
                    </View>

                    {/* Tab Content */}
                    <View style={styles.content}>
                        {activeTab === 'collection' ? (
                            showingTv ? (
                                tvShowsLoading ? renderLoadingSkeleton() :
                                !watchedTvShows?.length ? renderEmptyCollection() : (
                                    <View style={styles.webCollectionGrid}>
                                        {watchedTvShows.map((item) => (
                                            <CollectionGridCard
                                                key={item.tmdb_id}
                                                posterUrl={
                                                    item.poster_path
                                                        ? getTMDBImageUrl(item.poster_path, 'w342') ?? ''
                                                        : ''
                                                }
                                                isAiPoster={false}
                                                journeyCount={0}
                                                onPress={() => router.push(`/tv/${item.tmdb_id}`)}
                                                style={{ width: cardWidth, flexGrow: 0, flexShrink: 0, flexBasis: cardWidth }}
                                            />
                                        ))}
                                    </View>
                                )
                            ) : (
                                isLoading ? renderLoadingSkeleton() :
                                isError ? renderErrorState() :
                                !groupedMovies?.length ? renderEmptyCollection() : (
                                    <View style={styles.webCollectionGrid}>
                                        {groupedMovies.map((item) => {
                                            const isAiPoster = item.display_poster === 'ai_generated' && !!item.ai_poster_url;
                                            return (
                                                <CollectionGridCard
                                                    key={item.tmdb_id}
                                                    posterUrl={
                                                        isAiPoster
                                                            ? item.ai_poster_url!
                                                            : item.poster_path
                                                                ? getTMDBImageUrl(item.poster_path, 'w342') ?? ''
                                                                : ''
                                                    }
                                                    isAiPoster={isAiPoster}
                                                    journeyCount={item.journeyCount}
                                                    onPress={() => router.push(`/journey/movie/${item.tmdb_id}`)}
                                                    style={{ width: cardWidth, flexGrow: 0, flexShrink: 0, flexBasis: cardWidth }}
                                                />
                                            );
                                        })}
                                    </View>
                                )
                            )
                        ) : renderTabContent()}
                    </View>
                </Animated.ScrollView>
            )}

            {/* Sticky Stat-Tab Bar Overlay - appears when header is collapsed (native only;
                web uses CSS position:sticky on the inline tab bar instead) */}
            {!isWeb && (
                <Animated.View
                    style={[
                        styles.stickyTabBarOverlay,
                        { backgroundColor: colors.background, top: insets.top },
                        stickyTabBarStyle
                    ]}
                    pointerEvents={stickyBarVisible ? "box-none" : "none"}
                >
                    <View style={[styles.stickyStatTabBarContainer, { borderBottomColor: colors.border }]}>
                        {renderStatTabBar()}
                    </View>
                </Animated.View>
            )}

            <CreateListModal
                visible={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreate={async (data) => {
                    await createList({ name: data.name, description: data.description, isPublic: data.isPublic });
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerIconsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.xs,
        paddingBottom: Spacing.sm,
        gap: Spacing.md,
    },
    headerIconButton: {
        position: 'relative',
    },
    notificationBadge: {
        position: 'absolute',
        top: -4,
        right: -6,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    notificationBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    // Sticky tab bar overlay
    stickyTabBarOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    stickyStatTabBarContainer: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    header: {
        alignItems: 'center',
        paddingTop: Spacing.md,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        marginBottom: Spacing.sm,
    },
    username: {
        ...Typography.display.h3,
        marginBottom: 2,
    },
    bio: {
        ...Typography.body.sm,
    },
    // Follower/Following stats
    followStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.sm,
        gap: Spacing.md,
    },
    followStatItem: {
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
    },
    followStatValue: {
        ...Typography.display.h4,
    },
    followStatLabel: {
        ...Typography.body.xs,
        marginTop: 2,
    },
    followStatDivider: {
        width: 1,
        height: 24,
    },
    // Achievements section
    achievementsSection: {
        marginTop: Spacing.sm,
        width: '100%',
        gap: Spacing.sm,
    },
    achievementsLabel: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    achievementsHeader: {
        alignItems: 'center',
        width: '100%',
    },
    achievementsScrollContent: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
        ...(Platform.OS === 'web' ? { flexGrow: 1, justifyContent: 'center' } : {}),
    },
    // Combined stat-tab bar styles
    statTabBar: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
    },
    statTabBarSticky: {
        position: 'sticky' as any,
        top: 0,
        zIndex: 10,
    },
    statTabItem: {
        flex: 1,
        alignItems: 'center',
        paddingBottom: Spacing.sm,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        marginBottom: -1, // Overlap with container border
    },
    statTabItemActive: {
        // Active state handled inline with colors.tint
    },
    statTabValue: {
        ...Typography.display.h4,
    },
    statTabLabel: {
        ...Typography.body.xs,
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    content: {
        paddingHorizontal: Spacing.lg,
        minHeight: 400,
    },
    // FlatList column wrapper for 3-column grid (native)
    columnWrapper: {
        paddingHorizontal: Spacing.lg,
        gap: GRID_GAP,
        marginTop: GRID_GAP,
    },
    // Web collection grid (flex-wrap replaces FlatList numColumns)
    webCollectionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GRID_GAP,
        paddingTop: GRID_GAP,
    },
    sectionSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: Spacing.md,
        letterSpacing: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.xl * 2,
    },
    emptyTitle: {
        ...Typography.display.h4,
        marginTop: Spacing.md,
    },
    emptySubtitle: {
        ...Typography.body.sm,
        textAlign: 'center',
        paddingHorizontal: Spacing.xl,
    },
    skeletonGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    skeletonCard: {
        width: '31%',
        aspectRatio: 2 / 3,
        borderRadius: BorderRadius.sm,
    },
    retryButton: {
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.sm,
    },
    retryButtonText: {
        ...Typography.button,
        color: '#fff',
    },
    // Lists tab styles
    listsContent: {
        gap: Spacing.md,
        paddingTop: Spacing.md,
    },
    listCard: {
        marginBottom: 0,
    },
    listsSkeleton: {
        gap: Spacing.md,
    },
    listSkeletonCard: {
        height: 200,
        borderRadius: BorderRadius.md,
    },
    // First Takes tab styles
    firstTakesContent: {
    },
    reviewControls: {
        gap: Spacing.sm,
        paddingTop: Spacing.md,
        marginBottom: Spacing.md,
    },
    reviewSegment: {
        flexDirection: 'row' as const,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        overflow: 'hidden' as const,
    },
    reviewSegmentItem: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    reviewSegmentText: {
        fontSize: 12,
        fontWeight: '600' as const,
    },
    reviewMediaRow: {
        flexDirection: 'row' as const,
        gap: Spacing.md,
    },
    reviewMediaItem: {
        paddingVertical: 2,
    },
    reviewMediaText: {
        fontSize: 12,
        fontWeight: '500' as const,
    },
    reviewMediaTextActive: {
        fontWeight: '700' as const,
    },
    firstTakesSkeleton: {
        gap: Spacing.md,
    },
    firstTakeSkeletonCard: {
        height: 120,
        borderRadius: BorderRadius.md,
    },
    // Special list cards styles (Watchlist, Watching)
    specialListsRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    specialListCard: {
        flex: 1,
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
    },
    specialListHeader: {
        marginBottom: Spacing.sm,
    },
    specialListTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    specialListTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    specialListCount: {
        fontSize: 12,
        marginTop: 2,
    },
    // Empty state
    posterGridEmpty: {
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    // 1 poster - show it larger with proper aspect ratio
    posterGridSingle: {
        height: 140,
        borderRadius: 8,
        overflow: 'hidden',
    },
    posterImageSingle: {
        width: '50%',
        height: '100%',
    },
    // 2 posters - side by side
    posterGridTwo: {
        flexDirection: 'row',
        height: 120,
        gap: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    posterCellHalf: {
        flex: 1,
        overflow: 'hidden',
    },
    // 3 posters - row of 3
    posterGridThree: {
        flexDirection: 'row',
        height: 100,
        gap: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    posterCellThird: {
        flex: 1,
        overflow: 'hidden',
    },
    // 4 posters - 2x2 grid
    posterGridFour: {
        height: 140,
        flexDirection: 'row',
        flexWrap: 'wrap',
        borderRadius: 8,
        overflow: 'hidden',
    },
    posterCellQuarter: {
        width: '50%',
        height: '50%',
        padding: 1,
    },
    // Shared image style
    posterImage: {
        width: '100%',
        height: '100%',
    },
    listsSection: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: Spacing.md,
    },
    createListCard: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    createListText: {
        fontSize: 15,
        fontWeight: '600',
    },
    seeAllListsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.sm,
    },
    seeAllListsText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
