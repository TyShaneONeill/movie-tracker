import { useState } from 'react';
import { StyleSheet, View, Image, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CollectionGridCard } from '@/components/cards/collection-grid-card';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/use-auth';
import { useUserMovies } from '@/hooks/use-user-movies';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie } from '@/lib/database.types';

type TabType = 'collection' | 'first-takes' | 'lists';

export default function ProfileScreen() {
    const colorScheme = useColorScheme() ?? 'dark';
    const { user, signOut } = useAuth();
    const { movies, isLoading, refetch } = useUserMovies();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('collection');

    const theme = colorScheme === 'dark' ? 'dark' : 'light';
    const colors = Colors[theme];

    const watchedCount = movies?.filter(m => m.status === 'watched').length || 0;
    const reviewsCount = 48; // Mock data - would come from backend
    const listsCount = 12; // Mock data - would come from backend

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refetch();
        setIsRefreshing(false);
    };

    const handleSignOut = async () => {
        await signOut();
        router.replace('/(auth)/signin');
    };

    const renderMovieItem = ({ item }: { item: UserMovie }) => (
        <View style={[styles.movieItem, { backgroundColor: colors.card }]}>
            <Image
                source={{ uri: getTMDBImageUrl(item.poster_path, 'w185') || '' }}
                style={styles.poster}
            />
            <View style={styles.movieInfo}>
                <ThemedText style={styles.movieTitle} numberOfLines={1}>{item.title}</ThemedText>
                <ThemedText style={{ color: colors.icon, fontSize: 12 }}>
                    {item.release_date?.split('-')[0]}
                </ThemedText>
            </View>
            <View style={[styles.statusDot, { backgroundColor: item.status === 'watched' ? '#10b981' : '#f59e0b' }]} />
        </View>
    );

    const renderCollectionItem = ({ item }: { item: UserMovie }) => (
        <CollectionGridCard
            posterUrl={getTMDBImageUrl(item.poster_path, 'w500') || ''}
            onPress={() => {
                // Navigate to movie detail
                console.log('Navigate to movie:', item.id);
            }}
        />
    );

    const renderTabContent = () => {
        if (activeTab === 'collection') {
            return (
                <FlatList
                    data={movies}
                    renderItem={renderCollectionItem}
                    keyExtractor={item => item.id}
                    numColumns={3}
                    columnWrapperStyle={styles.collectionRow}
                    contentContainerStyle={[styles.collectionGrid, { paddingBottom: 100 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.tint} />
                    }
                    ListEmptyComponent={
                        <ThemedText style={{ textAlign: 'center', marginTop: 40, color: colors.icon }}>
                            No movies in your collection yet.
                        </ThemedText>
                    }
                />
            );
        } else if (activeTab === 'first-takes') {
            return (
                <View style={{ paddingBottom: 100 }}>
                    <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                        LATEST SNAPSHOT
                    </ThemedText>
                    <View style={[styles.firstTakeCard, { backgroundColor: colors.card, borderLeftColor: '#fbbf24' }]}>
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
                            "Wait... did they just reference The Godfather again? I'm dying. This is better than the first one!"
                        </ThemedText>
                    </View>
                </View>
            );
        } else {
            // Lists tab - placeholder for now
            return (
                <View style={{ paddingBottom: 100 }}>
                    <ThemedText style={{ textAlign: 'center', marginTop: 40, color: colors.icon }}>
                        Lists coming soon...
                    </ThemedText>
                </View>
            );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            {/* Settings Icon */}
            <View style={styles.settingsContainer}>
                <Pressable
                    onPress={() => {
                        console.log('Navigate to settings');
                        // router.push('/settings');
                    }}
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
                <View style={[styles.avatarContainer, { borderColor: colors.tint }]}>
                    <Ionicons name="person" size={48} color={colors.icon} />
                </View>
                <ThemedText type="title" style={styles.username}>
                    {user?.email?.split('@')[0] || 'Alex Chen'}
                </ThemedText>
                <ThemedText style={{ color: colors.textSecondary }}>Film Enthusiast & Critic</ThemedText>
            </View>

            {/* Stats Row */}
            <View style={[styles.statsContainer, { borderColor: colors.border || '#333' }]}>
                <View style={styles.statItem}>
                    <ThemedText type="title" style={{ fontSize: 18 }}>{watchedCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Watched</ThemedText>
                </View>
                <View style={styles.statItem}>
                    <ThemedText type="title" style={{ fontSize: 18 }}>{reviewsCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Reviews</ThemedText>
                </View>
                <View style={styles.statItem}>
                    <ThemedText type="title" style={{ fontSize: 18 }}>{listsCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Lists</ThemedText>
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
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    username: {
        fontSize: 24,
        marginBottom: 4,
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
        fontSize: 12,
        marginTop: 4,
        opacity: 0.7,
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
    // Legacy styles for old movie item (can be removed if not used)
    movieItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 12,
        borderRadius: 12,
    },
    poster: {
        width: 40,
        height: 60,
        borderRadius: 6,
        backgroundColor: '#333',
    },
    movieInfo: {
        flex: 1,
        marginLeft: 12,
    },
    movieTitle: {
        fontSize: 16,
        marginBottom: 2,
        fontWeight: '600',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginLeft: 8,
    },
});
