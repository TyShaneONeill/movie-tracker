/**
 * Person Detail Screen
 * Displays actor/director profile with biography and filmography
 *
 * Features:
 * - Profile photo with name and role
 * - Biography section (expandable)
 * - "Known For" horizontal scroll (top 5 movies)
 * - Full filmography grid (tappable → movie detail)
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { usePersonDetail } from '@/hooks/use-person-detail';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBMovieCredit } from '@/lib/tmdb.types';

// Grid layout constants
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GRID_GAP = Spacing.sm;
const AVAILABLE_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const CARD_WIDTH = (AVAILABLE_WIDTH - GRID_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

// Known For horizontal scroll card width
const KNOWN_FOR_CARD_WIDTH = 120;

// Back icon component
const BackIcon = ({ color = 'white' }: { color?: string }) => (
  <Svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
  >
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

/**
 * Format birthday to readable format and calculate age
 */
function formatBirthdayWithAge(birthday: string | null, deathday: string | null): string {
  if (!birthday) return '';

  const birthDate = new Date(birthday);
  const options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  const formattedDate = birthDate.toLocaleDateString('en-US', options);

  // Calculate age
  const endDate = deathday ? new Date(deathday) : new Date();
  let age = endDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = endDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && endDate.getDate() < birthDate.getDate())) {
    age--;
  }

  if (deathday) {
    return `${formattedDate} (${age} years old at death)`;
  }

  return `${formattedDate} (${age} years old)`;
}

/**
 * Get year from release date
 */
function getYear(releaseDate: string | null): string {
  if (!releaseDate) return '';
  return releaseDate.split('-')[0];
}

export default function PersonDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [bioExpanded, setBioExpanded] = useState(false);

  // Fetch person details
  const { person, filmography, knownFor, isLoading, isError, error } = usePersonDetail({
    personId: id || '',
    enabled: !!id,
  });

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleMoviePress = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  // Dynamic styles
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  // Truncate biography for collapsed view
  const MAX_BIO_LENGTH = 200;
  const shouldTruncateBio = person?.biography && person.biography.length > MAX_BIO_LENGTH;
  const displayBio = bioExpanded
    ? person?.biography
    : person?.biography?.slice(0, MAX_BIO_LENGTH) + (shouldTruncateBio ? '...' : '');

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <Pressable
            onPress={handleGoBack}
            style={({ pressed }) => [dynamicStyles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={dynamicStyles.headerTitle}>Loading...</Text>
          <View style={dynamicStyles.headerSpacer} />
        </View>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (isError || !person) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={dynamicStyles.header}>
          <Pressable
            onPress={handleGoBack}
            style={({ pressed }) => [dynamicStyles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={dynamicStyles.headerTitle}>Error</Text>
          <View style={dynamicStyles.headerSpacer} />
        </View>
        <View style={dynamicStyles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
          <Text style={dynamicStyles.errorTitle}>Person not found</Text>
          <Text style={dynamicStyles.errorSubtitle}>
            {error?.message || 'Could not load person details'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const profileUrl = getTMDBImageUrl(person.profile_path, 'w500');

  return (
    <SafeAreaView style={dynamicStyles.container}>
      {/* Navigation Header */}
      <View style={dynamicStyles.header}>
        <Pressable
          onPress={handleGoBack}
          style={({ pressed }) => [dynamicStyles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <BackIcon color={colors.text} />
        </Pressable>
        <Text style={dynamicStyles.headerTitle} numberOfLines={1}>
          {person.name}
        </Text>
        <View style={dynamicStyles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={dynamicStyles.scrollContent}
      >
        {/* Profile Header */}
        <View style={dynamicStyles.profileHeader}>
          {/* Profile Photo */}
          {profileUrl ? (
            <Image
              source={{ uri: profileUrl }}
              style={dynamicStyles.profilePhoto}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[dynamicStyles.profilePhoto, dynamicStyles.profilePhotoPlaceholder]}>
              <Ionicons name="person" size={60} color={colors.textSecondary} />
            </View>
          )}

          {/* Name & Role */}
          <Text style={dynamicStyles.name}>{person.name}</Text>
          <Text style={dynamicStyles.role}>{person.known_for_department}</Text>

          {/* Birth Info */}
          {person.birthday && (
            <Text style={dynamicStyles.birthInfo}>
              {formatBirthdayWithAge(person.birthday, person.deathday)}
            </Text>
          )}
          {person.place_of_birth && (
            <Text style={dynamicStyles.birthPlace}>{person.place_of_birth}</Text>
          )}
        </View>

        {/* Biography */}
        {person.biography && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Biography</Text>
            <Text style={dynamicStyles.biography}>{displayBio}</Text>
            {shouldTruncateBio && (
              <Pressable
                onPress={() => setBioExpanded(!bioExpanded)}
                style={({ pressed }) => [
                  dynamicStyles.readMoreButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={dynamicStyles.readMoreText}>
                  {bioExpanded ? 'Read Less' : 'Read More'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Known For */}
        {knownFor.length > 0 && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Known For</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={dynamicStyles.knownForScroll}
            >
              {knownFor.map((movie) => (
                <Pressable
                  key={`known-${movie.id}`}
                  onPress={() => handleMoviePress(movie.id)}
                  style={({ pressed }) => [
                    dynamicStyles.knownForCard,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  {movie.poster_path ? (
                    <Image
                      source={{ uri: getTMDBImageUrl(movie.poster_path, 'w342') ?? undefined }}
                      style={dynamicStyles.knownForPoster}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View
                      style={[
                        dynamicStyles.knownForPoster,
                        dynamicStyles.knownForPosterPlaceholder,
                      ]}
                    >
                      <Ionicons name="film-outline" size={32} color={colors.textSecondary} />
                    </View>
                  )}
                  <Text style={dynamicStyles.knownForTitle} numberOfLines={2}>
                    {movie.title}
                  </Text>
                  {movie.character && (
                    <Text style={dynamicStyles.knownForCharacter} numberOfLines={1}>
                      {movie.character}
                    </Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Filmography */}
        {filmography.length > 0 && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>
              Filmography ({filmography.length})
            </Text>
            <View style={dynamicStyles.filmographyGrid}>
              {filmography.map((movie) => (
                <Pressable
                  key={`film-${movie.id}`}
                  onPress={() => handleMoviePress(movie.id)}
                  style={({ pressed }) => [
                    dynamicStyles.filmCard,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  {movie.poster_path ? (
                    <Image
                      source={{ uri: getTMDBImageUrl(movie.poster_path, 'w342') ?? undefined }}
                      style={dynamicStyles.filmPoster}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View
                      style={[dynamicStyles.filmPoster, dynamicStyles.filmPosterPlaceholder]}
                    >
                      <Ionicons name="film-outline" size={24} color={colors.textSecondary} />
                    </View>
                  )}
                  {/* Year badge */}
                  {movie.release_date && (
                    <View style={dynamicStyles.yearBadge}>
                      <Text style={dynamicStyles.yearBadgeText}>
                        {getYear(movie.release_date)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Empty filmography state */}
        {filmography.length === 0 && (
          <View style={dynamicStyles.emptyContainer}>
            <Ionicons name="film-outline" size={48} color={colors.textSecondary} />
            <Text style={dynamicStyles.emptyTitle}>No filmography available</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Type for the colors object
type ThemeColors = typeof Colors.dark;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    backButton: {
      padding: Spacing.xs,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
      marginHorizontal: Spacing.sm,
    },
    headerSpacer: {
      width: 32,
    },
    scrollContent: {
      paddingBottom: 100,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.sm,
    },
    errorTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginTop: Spacing.md,
    },
    errorSubtitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    // Profile Header
    profileHeader: {
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.xl,
    },
    profilePhoto: {
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: colors.card,
      borderWidth: 3,
      borderColor: colors.tint,
    },
    profilePhotoPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    name: {
      ...Typography.display.h2,
      color: colors.text,
      marginTop: Spacing.lg,
      textAlign: 'center',
    },
    role: {
      ...Typography.body.base,
      color: colors.tint,
      marginTop: Spacing.xs,
      fontWeight: '600',
    },
    birthInfo: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
    },
    birthPlace: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },

    // Section
    section: {
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.lg,
    },
    sectionTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginBottom: Spacing.md,
    },

    // Biography
    biography: {
      ...Typography.body.base,
      color: colors.textSecondary,
      lineHeight: 24,
    },
    readMoreButton: {
      marginTop: Spacing.sm,
    },
    readMoreText: {
      ...Typography.body.sm,
      color: colors.tint,
      fontWeight: '600',
    },

    // Known For
    knownForScroll: {
      gap: Spacing.md,
      paddingRight: Spacing.lg,
    },
    knownForCard: {
      width: KNOWN_FOR_CARD_WIDTH,
    },
    knownForPoster: {
      width: KNOWN_FOR_CARD_WIDTH,
      aspectRatio: 2 / 3,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.card,
    },
    knownForPosterPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    knownForTitle: {
      ...Typography.body.sm,
      color: colors.text,
      fontWeight: '600',
      marginTop: Spacing.xs,
    },
    knownForCharacter: {
      ...Typography.caption.default,
      color: colors.textSecondary,
    },

    // Filmography Grid
    filmographyGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GRID_GAP,
    },
    filmCard: {
      width: CARD_WIDTH,
      position: 'relative',
    },
    filmPoster: {
      width: '100%',
      aspectRatio: 2 / 3,
      borderRadius: BorderRadius.sm,
      backgroundColor: colors.card,
    },
    filmPosterPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    yearBadge: {
      position: 'absolute',
      bottom: Spacing.xs,
      right: Spacing.xs,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.xs,
    },
    yearBadgeText: {
      ...Typography.caption.default,
      color: 'white',
      fontSize: 10,
      fontWeight: '600',
    },

    // Empty state
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: Spacing.xl * 2,
      gap: Spacing.sm,
    },
    emptyTitle: {
      ...Typography.display.h4,
      color: colors.text,
    },
  });
