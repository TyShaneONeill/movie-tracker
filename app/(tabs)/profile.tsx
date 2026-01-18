import { useState } from 'react';
import { StyleSheet, View, Image, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/use-auth';
import { useUserMovies } from '@/hooks/use-user-movies';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie } from '@/lib/database.types';

export default function ProfileScreen() {
    const colorScheme = useColorScheme() ?? 'dark';
    const { user, signOut } = useAuth();
    const { movies, isLoading, refetch } = useUserMovies();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const theme = colorScheme === 'dark' ? 'dark' : 'light';
    const colors = Colors[theme];

    const watchedCount = movies?.filter(m => m.status === 'watched').length || 0;
    const watchlistCount = movies?.filter(m => m.status === 'watchlist').length || 0;

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

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            <View style={styles.header}>
                <View style={[styles.avatarContainer, { borderColor: colors.border || '#333' }]}>
                    <Ionicons name="person" size={40} color={colors.icon} />
                </View>
                <ThemedText type="title" style={styles.username}>
                    {user?.email?.split('@')[0]}
                </ThemedText>
                <ThemedText style={{ color: colors.icon }}>{user?.email}</ThemedText>

                <Pressable
                    style={({ pressed }) => [styles.signOutButton, { opacity: pressed ? 0.7 : 1, borderColor: colors.border }]}
                    onPress={handleSignOut}
                >
                    <ThemedText style={{ color: colors.icon, fontSize: 13, fontWeight: '600' }}>Sign Out</ThemedText>
                </Pressable>
            </View>

            <View style={[styles.statsContainer, { borderColor: colors.border || '#333' }]}>
                <View style={styles.statItem}>
                    <ThemedText type="title" style={{ color: colors.tint }}>{watchedCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Watched</ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border || '#333' }]} />
                <View style={styles.statItem}>
                    <ThemedText type="title" style={{ color: colors.tint }}>{watchlistCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Watchlist</ThemedText>
                </View>
            </View>

            <View style={styles.content}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>Library</ThemedText>
                <FlatList
                    data={movies}
                    renderItem={renderMovieItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.tint} />
                    }
                    ListEmptyComponent={
                        <ThemedText style={{ textAlign: 'center', marginTop: 40, color: colors.icon }}>
                            No movies in your library yet.
                        </ThemedText>
                    }
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    username: {
        fontSize: 24,
        marginBottom: 4,
    },
    signOutButton: {
        marginTop: 16,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    statsContainer: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        paddingVertical: 16,
        marginBottom: 24,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    divider: {
        width: 1,
        height: '100%',
    },
    statLabel: {
        fontSize: 12,
        marginTop: 4,
        opacity: 0.7,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        marginBottom: 16,
        fontSize: 20,
    },
    listContent: {
        paddingBottom: 20,
    },
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
