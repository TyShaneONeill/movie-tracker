import { useState, useCallback, useRef } from 'react';
import { StyleSheet, View, Pressable, Image, RefreshControl, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { CollectionGridCard } from '@/components/cards/collection-grid-card';
import { ListCard } from '@/components/cards/list-card';
import { FirstTakeCard } from '@/components/cards/first-take-card';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useUserLists } from '@/hooks/use-user-lists';
import { useFirstTakes } from '@/hooks/use-first-takes';
import { useProfile } from '@/hooks/use-profile';
import { MOCK_USER } from '@/lib/mock-data/users';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie } from '@/lib/database.types';

type TabType = 'collection' | 'first-takes' | 'lists';

// Constants for header animation
const HEADER_MAX_HEIGHT = 230; // Full header height (avatar, name, bio, stats)
const HEADER_MIN_HEIGHT = 0; // Collapsed header height
const HEADER_SCROLL_DISTANCE = 180; // Scroll distance to fully collapse

// Grid layout constants
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GRID_GAP = Spacing.sm;
// Content area has paddingHorizontal: Spacing.lg, so available width for grid is:
const AVAILABLE_WIDTH = SCREEN_WIDTH - (Spacing.lg * 2);
const CARD_WIDTH = (AVAILABLE_WIDTH - (GRID_GAP * (COLUMN_COUNT - 1))) / COLUMN_COUNT;

export default function ProfileScreen() {
    const { effectiveTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<TabType>('collection');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const scrollViewRef = useRef<Animated.ScrollView>(null);

    const colors = Colors[effectiveTheme];

    // Animated scroll value
    const scrollY = useSharedValue(0);

    // Fetch user profile and stats
    const { profile, stats, refetch: refetchProfile, refetchStats } = useProfile();

    // Fetch watched movies for collection
    const {
        movies: watchedMovies,
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

    // Fetch user's first takes
    const {
        data: firstTakes,
        isLoading: takesLoading,
        isError: takesError,
        refetch: refetchTakes,
    } = useFirstTakes();

    // Scroll handler for tracking scroll position
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    // Animated style for collapsible header
    const headerAnimatedStyle = useAnimatedStyle(() => {
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
        setActiveTab(tab);
        // Scroll to top to expand header
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, []);

    // Handle refresh
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        // Scroll to top first to show the header
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });

        await Promise.all([
            refetchProfile(),
            refetchStats(),
            refetch(),
            refetchLists(),
            refetchTakes(),
        ]);
        setIsRefreshing(false);
    }, [refetchProfile, refetchStats, refetch, refetchLists, refetchTakes]);

    const renderCollectionItem = (item: UserMovie, index: number) => (
        <View key={item.id} style={styles.gridItem}>
            <CollectionGridCard
                posterUrl={item.poster_path ? getTMDBImageUrl(item.poster_path, 'w342') ?? '' : ''}
                onPress={() => router.push(`/movie/${item.tmdb_id}`)}
            />
        </View>
    );

    const renderEmptyCollection = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={48} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                No movies yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Movies you mark as watched will appear here
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

    const TAB_CONFIG: { key: TabType; label: string }[] = [
        { key: 'collection', label: 'Collection' },
        { key: 'first-takes', label: 'First Takes' },
        { key: 'lists', label: 'Lists' },
    ];

    const renderTabBar = () => (
        <>
            {TAB_CONFIG.map(({ key, label }) => (
                <Pressable
                    key={key}
                    onPress={() => handleTabChange(key)}
                    style={({ pressed }) => [
                        styles.tabItem,
                        activeTab === key && { borderBottomColor: colors.tint },
                        { opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <ThemedText style={[
                        styles.tabLabel,
                        { color: activeTab === key ? colors.text : colors.textSecondary }
                    ]}>
                        {label}
                    </ThemedText>
                </Pressable>
            ))}
        </>
    );

    const renderTabContent = () => {
        if (activeTab === 'collection') {
            if (isLoading) {
                return renderLoadingSkeleton();
            }

            if (isError) {
                return renderErrorState();
            }

            if (!watchedMovies?.length) {
                return renderEmptyCollection();
            }

            // Render collection as a grid (not nested FlatList)
            return (
                <View style={styles.collectionGrid}>
                    {watchedMovies.map((movie, index) => renderCollectionItem(movie, index))}
                </View>
            );
        } else if (activeTab === 'first-takes') {
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
                                createdAt={take.created_at ?? ''}
                                isLatest={index === 0}
                                onPress={() => router.push(`/movie/${take.tmdb_id}`)}
                            />
                        </View>
                    ))}
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
                </View>
            );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            {/* Settings Icon - Fixed at top */}
            <View style={styles.settingsContainer}>
                <Pressable
                    onPress={() => router.push('/settings')}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Circle cx={12} cy={12} r={3} />
                        <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </Svg>
                </Pressable>
            </View>

            <Animated.ScrollView
                ref={scrollViewRef}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.tint}
                    />
                }
            >
                {/* Collapsible Profile Header */}
                <Animated.View style={[styles.header, headerAnimatedStyle]}>
                    <Image
                        source={{ uri: profile?.avatar_url || MOCK_USER.avatarUrl }}
                        style={[styles.avatar, { borderColor: colors.tint }]}
                    />
                    <ThemedText style={[styles.username, { color: colors.text }]}>
                        {profile?.full_name || MOCK_USER.name}
                    </ThemedText>
                    <ThemedText style={[styles.bio, { color: colors.textSecondary }]}>
                        {profile?.bio || MOCK_USER.bio}
                    </ThemedText>

                    {/* Stats Row */}
                    <View style={[styles.statsContainer, { borderColor: colors.border }]}>
                        <View style={styles.statItem}>
                            <ThemedText style={[styles.statValue, { color: colors.text }]}>
                                {stats.watched}
                            </ThemedText>
                            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>
                                Watched
                            </ThemedText>
                        </View>
                        <View style={styles.statItem}>
                            <ThemedText style={[styles.statValue, { color: colors.text }]}>
                                {stats.firstTakes}
                            </ThemedText>
                            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>
                                First Takes
                            </ThemedText>
                        </View>
                        <View style={styles.statItem}>
                            <ThemedText style={[styles.statValue, { color: colors.text }]}>
                                {stats.lists}
                            </ThemedText>
                            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>
                                Lists
                            </ThemedText>
                        </View>
                    </View>
                </Animated.View>

                {/* Tab Bar */}
                <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
                    {renderTabBar()}
                </View>

                {/* Tab Content */}
                <View style={styles.content}>
                    {renderTabContent()}
                </View>
            </Animated.ScrollView>

            {/* Sticky Tab Bar Overlay - appears when header is collapsed */}
            <Animated.View
                style={[
                    styles.stickyTabBarOverlay,
                    { backgroundColor: colors.background },
                    stickyTabBarStyle
                ]}
                pointerEvents="box-none"
            >
                <View style={[styles.stickyTabBarContainer, { borderBottomColor: colors.border }]}>
                    {renderTabBar()}
                </View>
            </Animated.View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    settingsContainer: {
        alignItems: 'flex-end',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
    },
    // Sticky tab bar overlay
    stickyTabBarOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    stickyTabBarContainer: {
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
    statsContainer: {
        flexDirection: 'row',
        marginTop: Spacing.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        width: '100%',
        borderTopWidth: 1,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        ...Typography.display.h4,
    },
    statLabel: {
        ...Typography.body.xs,
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        paddingBottom: Spacing.sm,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabLabel: {
        fontWeight: '600',
        fontSize: 16,
    },
    content: {
        paddingHorizontal: Spacing.lg,
        minHeight: 400,
    },
    // Collection grid styles
    collectionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GRID_GAP,
    },
    gridItem: {
        width: CARD_WIDTH,
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
});
