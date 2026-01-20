import { useState } from 'react';
import { StyleSheet, View, Image, Pressable, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { CollectionGridCard } from '@/components/cards/collection-grid-card';
import { ListCard } from '@/components/cards/list-card';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useUserLists } from '@/hooks/use-user-lists';
import { MOCK_USER } from '@/lib/mock-data/users';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie } from '@/lib/database.types';

type TabType = 'collection' | 'first-takes' | 'lists';

export default function ProfileScreen() {
    const colorScheme = useColorScheme() ?? 'dark';
    const [activeTab, setActiveTab] = useState<TabType>('collection');

    const theme = colorScheme === 'dark' ? 'dark' : 'light';
    const colors = Colors[theme];

    // Fetch watched movies for collection
    const {
        movies: watchedMovies,
        isLoading,
        isError,
        isRefetching,
        refetch,
    } = useUserMovies('watched');

    // Fetch user's lists
    const {
        data: userLists,
        isLoading: listsLoading,
        isError: listsError,
        refetch: refetchLists,
    } = useUserLists();

    const renderCollectionItem = ({ item }: { item: UserMovie }) => (
        <CollectionGridCard
            posterUrl={item.poster_path ? getTMDBImageUrl(item.poster_path, 'w342') : ''}
            onPress={() => router.push(`/movie/${item.tmdb_id}`)}
        />
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
    const renderListsEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={48} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                No lists yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Create your first list to organize your movies
            </ThemedText>
        </View>
    );

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

            return (
                <FlatList
                    data={watchedMovies}
                    renderItem={renderCollectionItem}
                    keyExtractor={item => item.id}
                    numColumns={3}
                    columnWrapperStyle={styles.collectionRow}
                    contentContainerStyle={[styles.collectionGrid, { paddingBottom: 100 }]}
                    showsVerticalScrollIndicator={false}
                    onRefresh={refetch}
                    refreshing={isRefetching}
                />
            );
        } else if (activeTab === 'first-takes') {
            return (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                >
                    <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                        LATEST SNAPSHOT
                    </ThemedText>
                    <View style={[styles.firstTakeCard, { backgroundColor: colors.card, borderLeftColor: colors.gold }]}>
                        <View style={styles.firstTakeHeader}>
                            <View style={styles.firstTakeInfo}>
                                <Image
                                    source={{ uri: 'https://image.tmdb.org/t/p/w200/pxv61t1jh2BwkgqZ68t7r6v8q.jpg' }}
                                    style={styles.firstTakePoster}
                                />
                                <View>
                                    <ThemedText style={styles.firstTakeTitle}>Zootopia 2</ThemedText>
                                    <ThemedText style={[styles.firstTakeTime, { color: colors.textSecondary }]}>Just now</ThemedText>
                                </View>
                            </View>
                            <ThemedText style={styles.firstTakeEmoji}>🔥</ThemedText>
                        </View>
                        <ThemedText style={[styles.firstTakeQuote, { color: colors.text }]}>
                            &ldquo;Wait... did they just reference The Godfather again? I&rsquo;m dying. This is better than the first one!&rdquo;
                        </ThemedText>
                    </View>
                </ScrollView>
            );
        } else {
            // Lists tab
            if (listsLoading) {
                return renderListsSkeleton();
            }

            if (listsError) {
                return renderListsError();
            }

            if (!userLists?.length) {
                return renderListsEmpty();
            }

            return (
                <ScrollView
                    contentContainerStyle={styles.listsContent}
                    showsVerticalScrollIndicator={false}
                >
                    {userLists.map((list) => (
                        <ListCard
                            key={list.id}
                            title={list.name}
                            description={list.description}
                            movieCount={list.movie_count}
                            posterUrls={list.movies.map(m =>
                                m.poster_path ? getTMDBImageUrl(m.poster_path, 'w185') : ''
                            )}
                            onPress={() => router.push(`/list/${list.id}`)}
                            style={styles.listCard}
                        />
                    ))}
                </ScrollView>
            );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            {/* Settings Icon */}
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

            {/* Profile Header */}
            <View style={styles.header}>
                <Image
                    source={{ uri: MOCK_USER.avatarUrl }}
                    style={[styles.avatar, { borderColor: colors.tint }]}
                />
                <ThemedText style={[styles.username, { color: colors.text }]}>
                    {MOCK_USER.name}
                </ThemedText>
                <ThemedText style={[styles.bio, { color: colors.textSecondary }]}>
                    {MOCK_USER.bio}
                </ThemedText>
            </View>

            {/* Stats Row */}
            <View style={[styles.statsContainer, { borderColor: colors.border }]}>
                <View style={styles.statItem}>
                    <ThemedText style={[styles.statValue, { color: colors.text }]}>
                        {MOCK_USER.stats.watched}
                    </ThemedText>
                    <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>
                        Watched
                    </ThemedText>
                </View>
                <View style={styles.statItem}>
                    <ThemedText style={[styles.statValue, { color: colors.text }]}>
                        {MOCK_USER.stats.reviews}
                    </ThemedText>
                    <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>
                        Reviews
                    </ThemedText>
                </View>
                <View style={styles.statItem}>
                    <ThemedText style={[styles.statValue, { color: colors.text }]}>
                        {MOCK_USER.stats.lists}
                    </ThemedText>
                    <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>
                        Lists
                    </ThemedText>
                </View>
            </View>

            {/* Tab Bar */}
            <View style={styles.tabBar}>
                <Pressable
                    onPress={() => setActiveTab('collection')}
                    style={({ pressed }) => [
                        styles.tabItem,
                        activeTab === 'collection' && { borderBottomColor: colors.tint },
                        { opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <ThemedText style={[
                        styles.tabLabel,
                        { color: activeTab === 'collection' ? colors.text : colors.textSecondary }
                    ]}>
                        Collection
                    </ThemedText>
                </Pressable>
                <Pressable
                    onPress={() => setActiveTab('first-takes')}
                    style={({ pressed }) => [
                        styles.tabItem,
                        activeTab === 'first-takes' && { borderBottomColor: colors.tint },
                        { opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <ThemedText style={[
                        styles.tabLabel,
                        { color: activeTab === 'first-takes' ? colors.text : colors.textSecondary }
                    ]}>
                        First Takes
                    </ThemedText>
                </Pressable>
                <Pressable
                    onPress={() => setActiveTab('lists')}
                    style={({ pressed }) => [
                        styles.tabItem,
                        activeTab === 'lists' && { borderBottomColor: colors.tint },
                        { opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <ThemedText style={[
                        styles.tabLabel,
                        { color: activeTab === 'lists' ? colors.text : colors.textSecondary }
                    ]}>
                        Lists
                    </ThemedText>
                </Pressable>
            </View>

            {/* Tab Content */}
            <View style={styles.content}>
                {renderTabContent()}
            </View>
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
    header: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        marginBottom: Spacing.md,
    },
    username: {
        ...Typography.display.h3,
        marginBottom: 4,
    },
    bio: {
        ...Typography.body.base,
    },
    statValue: {
        ...Typography.display.h4,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: Spacing.xl,
        marginVertical: Spacing.lg,
        paddingVertical: Spacing.md,
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },
    statItem: {
        alignItems: 'center',
    },
    statLabel: {
        ...Typography.body.xs,
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    tabBar: {
        flexDirection: 'row',
        gap: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    tabItem: {
        paddingBottom: Spacing.sm,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabLabel: {
        fontWeight: '600',
        fontSize: 16,
    },
    content: {
        flex: 1,
        paddingHorizontal: Spacing.lg,
    },
    collectionGrid: {
        gap: Spacing.sm,
    },
    collectionRow: {
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    sectionSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: Spacing.md,
        letterSpacing: 1,
    },
    firstTakeCard: {
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.lg,
        borderLeftWidth: 4,
    },
    firstTakeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.sm,
    },
    firstTakeInfo: {
        flexDirection: 'row',
        gap: Spacing.sm,
        flex: 1,
    },
    firstTakePoster: {
        width: 30,
        height: 45,
        borderRadius: 4,
        backgroundColor: '#333',
    },
    firstTakeTitle: {
        fontWeight: '600',
        fontSize: 14,
    },
    firstTakeTime: {
        fontSize: 12,
    },
    firstTakeEmoji: {
        fontSize: 20,
    },
    firstTakeQuote: {
        fontSize: 14,
        fontStyle: 'italic',
        lineHeight: 20,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.xxl,
        gap: Spacing.sm,
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
        paddingBottom: 100,
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
});
