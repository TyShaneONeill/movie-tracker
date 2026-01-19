/**
 * Search Screen
 * Matches ui-mocks/search.html structure
 * Sticky header with back button + search input
 * Category filter chips (Top Results, Movies, People, Lists, Users)
 * Recent searches section with clear button
 * Browse by Genre 2-column grid
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Tag } from '@/components/ui/tag';

// SVG Icons as components
const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const SearchIcon = ({ color = '#a1a1aa' }: { color?: string }) => (
  <View style={{ position: 'absolute', left: 16, top: '50%', marginTop: -10, pointerEvents: 'none' }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  </View>
);

const ClockIcon = ({ color = '#a1a1aa' }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const XIcon = ({ color = '#a1a1aa' }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// Category filter options
const CATEGORIES = ['Top Results', 'Movies', 'People', 'Lists', 'Users'];

// Mock recent searches data
const RECENT_SEARCHES = [
  {
    id: '1',
    type: 'person' as const,
    title: 'Christopher Nolan',
    subtitle: 'Director',
  },
  {
    id: '2',
    type: 'movie' as const,
    title: 'Dune: Part Two',
    subtitle: '2024',
    posterUrl: 'https://image.tmdb.org/t/p/w200/qhb1qOilapbapxWQn9jtRCMwXJF.jpg',
  },
];

// Mock genre data
const GENRES = [
  {
    id: '1',
    name: 'Sci-Fi',
    imageUrl: 'https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHkjPo37wq.jpg',
  },
  {
    id: '2',
    name: 'Action',
    imageUrl: 'https://image.tmdb.org/t/p/w500/pFlaoOXp515l2i0uDLIj92JE89k.jpg',
  },
  {
    id: '3',
    name: 'Animation',
    imageUrl: 'https://image.tmdb.org/t/p/w500/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
  },
  {
    id: '4',
    name: 'Drama',
    imageUrl: 'https://image.tmdb.org/t/p/w500/hr9rjR3J0xBBK9oi4pY5U3ZeHv7.jpg',
  },
];

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Top Results');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleClearRecent = () => {
    // Placeholder: Clear recent searches
    console.log('Clear recent searches');
  };

  const handleRecentSearchPress = (search: typeof RECENT_SEARCHES[0]) => {
    // Navigate based on type
    if (search.type === 'person') {
      router.push('/person/1'); // Placeholder ID
    } else if (search.type === 'movie') {
      router.push('/movie/1'); // Placeholder ID
    }
  };

  const handleRemoveRecentSearch = (id: string) => {
    // Placeholder: Remove from recent searches
    console.log('Remove search:', id);
  };

  const handleGenrePress = (genreName: string) => {
    // Placeholder: Navigate to genre results
    console.log('Genre pressed:', genreName);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        {/* Back Button + Search Input */}
        <View style={styles.topRow}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <BackIcon />
          </Pressable>

          <View style={styles.searchBarContainer}>
            <SearchIcon color={colors.textSecondary} />
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.card,
                  color: colors.text,
                  ...Typography.body.base,
                },
              ]}
              placeholder="Movies, people, lists..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>
        </View>

        {/* Category Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORIES.map((category) => (
            <Tag
              key={category}
              label={category}
              active={activeCategory === category}
              onPress={() => setActiveCategory(category)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Recent Searches Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            RECENT
          </Text>
          <Pressable
            onPress={handleClearRecent}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={[styles.clearButton, { color: colors.textSecondary }]}>
              Clear
            </Text>
          </Pressable>
        </View>

        {RECENT_SEARCHES.map((search) => (
          <Pressable
            key={search.id}
            onPress={() => handleRecentSearchPress(search)}
            style={({ pressed }) => [
              styles.recentItem,
              {
                backgroundColor: pressed ? colors.backgroundSecondary : 'transparent',
              },
            ]}
          >
            {/* Icon or Poster */}
            {search.type === 'person' ? (
              <View
                style={[
                  styles.recentIconContainer,
                  { backgroundColor: colors.card },
                ]}
              >
                <ClockIcon color={colors.textSecondary} />
              </View>
            ) : (
              <Image
                source={{ uri: search.posterUrl }}
                style={styles.recentPoster}
              />
            )}

            {/* Text */}
            <View style={styles.recentTextContainer}>
              <Text style={[styles.recentTitle, { color: colors.text }]}>
                {search.title}
              </Text>
              <Text style={[styles.recentSubtitle, { color: colors.textSecondary }]}>
                {search.subtitle}
              </Text>
            </View>

            {/* Remove Button */}
            <Pressable
              onPress={() => handleRemoveRecentSearch(search.id)}
              style={({ pressed }) => [
                styles.removeButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              hitSlop={8}
            >
              <XIcon color={colors.textSecondary} />
            </Pressable>
          </Pressable>
        ))}

        {/* Browse by Genre Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
          BROWSE BY GENRE
        </Text>

        <View style={styles.genreGrid}>
          {GENRES.map((genre) => (
            <Pressable
              key={genre.id}
              onPress={() => handleGenrePress(genre.name)}
              style={({ pressed }) => [
                styles.genreCard,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Image
                source={{ uri: genre.imageUrl }}
                style={styles.genreImage}
              />
              <LinearGradient
                colors={['rgba(225, 29, 72, 0.8)', 'rgba(15, 15, 19, 0.8)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.genreOverlay}
              />
              <Text style={styles.genreName}>{genre.name}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    zIndex: 50,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  searchBarContainer: {
    flex: 1,
    position: 'relative',
  },
  searchInput: {
    paddingVertical: Spacing.md,
    paddingLeft: 48,
    paddingRight: Spacing.md,
    borderRadius: BorderRadius.md,
    fontFamily: 'Inter_400Regular',
  },
  categoryScroll: {
    marginTop: Spacing.sm,
  },
  categoryScrollContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 90, // Bottom nav bar clearance
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.body.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearButton: {
    ...Typography.body.sm,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  recentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPoster: {
    width: 40,
    height: 60,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#27272a', // fallback
  },
  recentTextContainer: {
    flex: 1,
  },
  recentTitle: {
    ...Typography.body.base,
    fontWeight: '600',
  },
  recentSubtitle: {
    ...Typography.body.sm,
  },
  removeButton: {
    padding: Spacing.xs,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  genreCard: {
    width: '48%',
    height: 100,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genreImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  genreOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  genreName: {
    ...Typography.body.lg,
    fontWeight: '700',
    color: 'white',
    zIndex: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
