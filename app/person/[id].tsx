/**
 * Person Detail Screen
 * Matches ui-mocks/person_detail.html
 *
 * Features:
 * - Centered avatar with gradient background effect
 * - Name, role (Director/Actor), age
 * - Stats bubbles (Credits count, Avg Rating)
 * - Biography text with "Read more" truncation
 * - Known For horizontal poster scroll
 * - Full filmography list
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

// Mock data for the person (in real app, fetch by ID)
const MOCK_PERSON = {
  id: '1',
  name: 'Timothée Chalamet',
  role: 'Actor',
  age: 29,
  credits: 32,
  avgRating: 8.1,
  avatarUrl: 'https://image.tmdb.org/t/p/w500/lFDe5Fj28u10y8yqecjW1k06j5.jpg',
  biography: 'Timothée Hal Chalamet is an American and French actor. He has received various accolades, including nominations for an Academy Award, two Golden Globe Awards, and three BAFTA Film Awards. Chalamet began his career as a teenager in television, appearing in the drama series Homeland in 2012.',
  knownFor: [
    {
      id: '1',
      title: 'Dune: Part Two',
      posterUrl: 'https://image.tmdb.org/t/p/w200/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    },
    {
      id: '2',
      title: 'Wonka',
      posterUrl: 'https://image.tmdb.org/t/p/w200/8c4a8kE7PizaGQQnditMmI1xbRp.jpg',
    },
    {
      id: '3',
      title: 'Dune',
      posterUrl: 'https://image.tmdb.org/t/p/w200/1E5baAaEse26fej7uHkjPo37wq.jpg',
    },
  ],
  filmography: [
    {
      id: '1',
      title: 'Dune: Part Two',
      character: 'Paul Atreides',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w200/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    },
    {
      id: '2',
      title: 'Wonka',
      character: 'Willy Wonka',
      year: '2023',
      posterUrl: 'https://image.tmdb.org/t/p/w200/8c4a8kE7PizaGQQnditMmI1xbRp.jpg',
    },
    {
      id: '3',
      title: 'Bones and All',
      character: 'Lee',
      year: '2022',
      posterUrl: 'https://image.tmdb.org/t/p/w200/ygO9lowFMXWtgVxR95lBpSdRf.jpg',
    },
  ],
};

export default function PersonDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); // Will be used for fetching person by ID in production
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [biographyExpanded, setBiographyExpanded] = useState(false);

  // In a real app, fetch person by params.id
  const person = MOCK_PERSON;

  const handleNavigateToMovie = (movieId: string) => {
    router.push(`/movie/${movieId}`);
  };

  const truncatedBio = person.biography.slice(0, 200) + '...';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with back and share buttons */}
      <View style={styles.headerButtons}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <BlurView intensity={20} tint="dark" style={styles.blurButton}>
            <Text style={styles.buttonIcon}>←</Text>
          </BlurView>
        </Pressable>

        <Pressable
          onPress={() => {
            // Share functionality would go here
          }}
          style={styles.headerButton}
        >
          <BlurView intensity={20} tint="dark" style={styles.blurButton}>
            <Text style={styles.buttonIcon}>⋮</Text>
          </BlurView>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Person Header with gradient background */}
        <LinearGradient
          colors={[colors.card, colors.background]}
          style={styles.personHeader}
        >
          <Image
            source={{ uri: person.avatarUrl }}
            style={styles.personAvatar}
          />
          <Text style={[styles.personName, { color: colors.text }]}>
            {person.name}
          </Text>
          <Text style={[styles.personMeta, { color: colors.textSecondary }]}>
            {person.role} • {person.age} years old
          </Text>

          {/* Stats bubbles */}
          <View style={styles.statsRow}>
            <View style={[styles.statBubble, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.statText, { color: colors.textSecondary }]}>
                {person.credits} Credits
              </Text>
            </View>
            <View style={[styles.statBubble, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.statText, { color: colors.textSecondary }]}>
                {person.avgRating} Avg Rating
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Biography Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Biography
          </Text>
          <Text style={[styles.biographyText, { color: colors.textSecondary }]}>
            {biographyExpanded ? person.biography : truncatedBio}
            {!biographyExpanded && (
              <Text
                onPress={() => setBiographyExpanded(true)}
                style={[styles.readMore, { color: colors.tint }]}
              >
                {' '}Read more
              </Text>
            )}
          </Text>
        </View>

        {/* Known For Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Known For
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.knownForScroll}
          >
            {person.knownFor.map((movie) => (
              <Pressable
                key={movie.id}
                onPress={() => handleNavigateToMovie(movie.id)}
                style={styles.knownForCard}
              >
                <Image
                  source={{ uri: movie.posterUrl }}
                  style={styles.knownForPoster}
                />
                <Text style={[styles.knownForTitle, { color: colors.text }]}>
                  {movie.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Filmography Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Filmography
          </Text>
          {person.filmography.map((film) => (
            <Pressable
              key={film.id}
              onPress={() => handleNavigateToMovie(film.id)}
              style={[styles.filmographyItem, { backgroundColor: colors.card }]}
            >
              <Image
                source={{ uri: film.posterUrl }}
                style={styles.filmPoster}
              />
              <View style={styles.filmInfo}>
                <Text style={[styles.filmTitle, { color: colors.text }]}>
                  {film.title}
                </Text>
                <Text style={[styles.filmCharacter, { color: colors.textSecondary }]}>
                  as {film.character}
                </Text>
              </View>
              <Text style={[styles.filmYear, { color: colors.textSecondary }]}>
                {film.year}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Bottom padding for safe area */}
        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  headerButtons: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  blurButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  personHeader: {
    alignItems: 'center',
    paddingTop: Spacing.xl + 40, // Account for header buttons
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  personAvatar: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
    borderWidth: 4,
    borderColor: '#09090b',
  },
  personName: {
    ...Typography.display.h2,
    textAlign: 'center',
  },
  personMeta: {
    ...Typography.body.base,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBubble: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
  },
  statText: {
    ...Typography.body.sm,
  },
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.display.h3,
    marginBottom: Spacing.md,
  },
  biographyText: {
    ...Typography.body.sm,
    lineHeight: 22.4, // 1.6 line-height from HTML mock
    marginBottom: Spacing.lg,
  },
  readMore: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
  knownForScroll: {
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  knownForCard: {
    width: 140,
  },
  knownForPoster: {
    width: 140,
    height: 210,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  knownForTitle: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
  filmographyItem: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  filmPoster: {
    width: 50,
    height: 75,
    borderRadius: BorderRadius.sm,
  },
  filmInfo: {
    flex: 1,
  },
  filmTitle: {
    ...Typography.body.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  filmCharacter: {
    ...Typography.body.sm,
  },
  filmYear: {
    ...Typography.body.sm,
  },
});
