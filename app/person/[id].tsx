/**
 * Person Detail Screen
 *
 * Features:
 * - Centered avatar with gradient background effect
 * - Name, department, age
 * - Stats bubbles (Credits count, Avg Rating)
 * - Biography text with "Read more" truncation
 * - Known For horizontal poster scroll
 * - Full filmography list
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonDetail } from '@/hooks/use-person-detail';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

type FilmographyItem =
  | { type: 'movie-header'; count: number }
  | { type: 'tv-header'; count: number }
  | { type: 'movie'; credit: import('@/lib/tmdb.types').TMDBPersonMovieCredit }
  | { type: 'tv'; credit: import('@/lib/tmdb.types').TMDBPersonTvCredit };

const getAge = (birthday: string | null, deathday: string | null): number | null => {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) age--;
  return age;
};

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const insets = useSafeAreaInsets();
  const { person, movieCredits, tvCredits, isLoading, isError, error } = usePersonDetail({ personId: id ?? '' });

  const [biographyExpanded, setBiographyExpanded] = useState(false);

  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  const knownFor = useMemo(() => {
    const normalizedTv = tvCredits.map(c => ({
      id: c.id,
      title: c.name,
      poster_path: c.poster_path,
      popularity: c.popularity,
      credit_id: c.credit_id,
      release_date: c.first_air_date,
      isTv: true as const,
    }));
    const normalizedMovies = movieCredits.map(c => ({
      id: c.id,
      title: c.title,
      poster_path: c.poster_path,
      popularity: c.popularity,
      credit_id: c.credit_id,
      release_date: c.release_date,
      isTv: false as const,
    }));
    const merged = [...normalizedMovies, ...normalizedTv]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 5);
    return merged;
  }, [movieCredits, tvCredits]);

  const avgRating = useMemo(() => {
    const allCredits = [
      ...movieCredits.map(c => c.vote_average),
      ...tvCredits.map(c => c.vote_average),
    ];
    const rated = allCredits.filter(v => v > 0);
    if (!rated.length) return null;
    const sum = rated.reduce((acc, v) => acc + v, 0);
    return (sum / rated.length).toFixed(1);
  }, [movieCredits, tvCredits]);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const filmographyData = useMemo((): FilmographyItem[] => {
    const items: FilmographyItem[] = [];
    if (movieCredits.length > 0) {
      items.push({ type: 'movie-header', count: movieCredits.length });
      for (const credit of movieCredits) {
        items.push({ type: 'movie', credit });
      }
    }
    if (tvCredits.length > 0) {
      items.push({ type: 'tv-header', count: tvCredits.length });
      for (const credit of tvCredits) {
        items.push({ type: 'tv', credit });
      }
    }
    return items;
  }, [movieCredits, tvCredits]);

  const renderFilmographyItem = useCallback(({ item }: { item: FilmographyItem }) => {
    if (item.type === 'movie-header') {
      return (
        <View style={[dynamicStyles.filmographyHeader, dynamicStyles.filmographyHeaderInList]}>
          <Text style={dynamicStyles.sectionTitleNoMargin}>Filmography</Text>
          <View style={dynamicStyles.countBadge}>
            <Text style={dynamicStyles.countBadgeText}>{item.count}</Text>
          </View>
        </View>
      );
    }
    if (item.type === 'tv-header') {
      return (
        <View style={[dynamicStyles.filmographyHeader, dynamicStyles.filmographyHeaderInList]}>
          <Text style={dynamicStyles.sectionTitleNoMargin}>TV Shows</Text>
          <View style={dynamicStyles.countBadge}>
            <Text style={dynamicStyles.countBadgeText}>{item.count}</Text>
          </View>
        </View>
      );
    }
    if (item.type === 'movie') {
      const { credit } = item;
      const thumbUrl = getTMDBImageUrl(credit.poster_path, 'w154');
      const year = credit.release_date?.split('-')[0];
      return (
        <Pressable
          onPress={() => router.push(`/movie/${credit.id}`)}
          style={dynamicStyles.filmographyRowInList}
        >
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              style={dynamicStyles.filmographyPoster}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[dynamicStyles.filmographyPoster, dynamicStyles.posterPlaceholder]}>
              <Ionicons name="film-outline" size={20} color={colors.textSecondary} />
            </View>
          )}
          <View style={dynamicStyles.filmographyInfo}>
            <Text style={dynamicStyles.filmographyTitle} numberOfLines={1}>
              {credit.title}
            </Text>
            {credit.character ? (
              <Text style={dynamicStyles.filmographyCharacter} numberOfLines={1}>
                as {credit.character}
              </Text>
            ) : null}
          </View>
          {year ? (
            <Text style={dynamicStyles.filmographyYear}>{year}</Text>
          ) : null}
        </Pressable>
      );
    }
    // item.type === 'tv'
    const { credit } = item;
    const thumbUrl = getTMDBImageUrl(credit.poster_path, 'w154');
    const year = credit.first_air_date?.split('-')[0];
    return (
      <Pressable
        onPress={() => router.push(`/tv/${credit.id}`)}
        style={dynamicStyles.filmographyRowInList}
      >
        {thumbUrl ? (
          <Image
            source={{ uri: thumbUrl }}
            style={dynamicStyles.filmographyPoster}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[dynamicStyles.filmographyPoster, dynamicStyles.posterPlaceholder]}>
            <Ionicons name="tv-outline" size={20} color={colors.textSecondary} />
          </View>
        )}
        <View style={dynamicStyles.filmographyInfo}>
          <Text style={dynamicStyles.filmographyTitle} numberOfLines={1}>
            {credit.name}
          </Text>
          {credit.character ? (
            <Text style={dynamicStyles.filmographyCharacter} numberOfLines={1}>
              as {credit.character}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {credit.episode_count > 0 && (
            <View style={dynamicStyles.episodeBadge}>
              <Text style={dynamicStyles.episodeBadgeText}>
                {credit.episode_count} ep{credit.episode_count !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {year ? (
            <Text style={dynamicStyles.filmographyYear}>{year}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  }, [dynamicStyles, colors.textSecondary, router]);

  const getItemKey = useCallback((item: FilmographyItem): string => {
    if (item.type === 'movie-header') return 'header-movie';
    if (item.type === 'tv-header') return 'header-tv';
    return item.credit.credit_id;
  }, []);

  if (isLoading) {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
        <View style={[dynamicStyles.backButtonContainer, { top: insets.top + Spacing.xs }]}>
          <Pressable onPress={handleGoBack} style={dynamicStyles.backButton}>
            <BlurView intensity={80} tint={effectiveTheme} style={dynamicStyles.blurButton}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </BlurView>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isError || !person) {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.errorContainer}>
          <Text style={dynamicStyles.errorTitle}>Something went wrong</Text>
          <Text style={dynamicStyles.errorSubtitle}>
            {error?.message || 'Could not load person details'}
          </Text>
          <Pressable onPress={handleGoBack} style={dynamicStyles.errorBackButton}>
            <Text style={dynamicStyles.errorBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const age = getAge(person.birthday, person.deathday);
  const profileUrl = getTMDBImageUrl(person.profile_path, 'w185');
  const hasBio = person.biography && person.biography.length > 0;
  const bioNeedsTruncation = hasBio && person.biography.length > 200;
  const displayBio = biographyExpanded || !bioNeedsTruncation
    ? person.biography
    : person.biography.slice(0, 200) + '...';

  const metaParts: string[] = [];
  if (person.known_for_department) metaParts.push(person.known_for_department);
  if (age !== null) metaParts.push(person.deathday ? `Died at ${age}` : `${age} years old`);
  if (person.place_of_birth) metaParts.push(person.place_of_birth);

  const listHeader = (
    <>
      {/* Profile Header */}
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={dynamicStyles.profileHeader}
      >
        {profileUrl ? (
          <Image
            source={{ uri: profileUrl }}
            style={dynamicStyles.avatar}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[dynamicStyles.avatar, dynamicStyles.avatarPlaceholder]}>
            <Ionicons name="person" size={48} color={colors.textSecondary} />
          </View>
        )}
        <Text style={dynamicStyles.personName}>{person.name}</Text>
        {metaParts.length > 0 && (
          <Text style={dynamicStyles.personMeta}>
            {metaParts.join(' \u2022 ')}
          </Text>
        )}

        {/* Stats Row */}
        <View style={dynamicStyles.statsRow}>
          <View style={dynamicStyles.statBubble}>
            <Text style={dynamicStyles.statText}>
              {movieCredits.length + tvCredits.length} Credits
            </Text>
          </View>
          {avgRating && (
            <View style={dynamicStyles.statBubble}>
              <Text style={dynamicStyles.statText}>
                {avgRating} Avg Rating
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Biography Section */}
      {hasBio && (
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Biography</Text>
          <Text style={dynamicStyles.bioText}>
            {displayBio}
            {bioNeedsTruncation && !biographyExpanded && (
              <Text
                onPress={() => setBiographyExpanded(true)}
                style={dynamicStyles.readMoreText}
              >
                {' '}Read more
              </Text>
            )}
            {bioNeedsTruncation && biographyExpanded && (
              <Text
                onPress={() => setBiographyExpanded(false)}
                style={dynamicStyles.readMoreText}
              >
                {' '}Read less
              </Text>
            )}
          </Text>
        </View>
      )}

      {/* Known For Section */}
      {knownFor.length > 0 && (
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Known For</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={dynamicStyles.knownForScroll}
            contentContainerStyle={dynamicStyles.knownForScrollContent}
          >
            {knownFor.map((credit) => {
              const posterUrl = getTMDBImageUrl(credit.poster_path, 'w342');
              return (
                <Pressable
                  key={credit.credit_id}
                  onPress={() => router.push(credit.isTv ? `/tv/${credit.id}` : `/movie/${credit.id}`)}
                  style={dynamicStyles.knownForCard}
                >
                  {posterUrl ? (
                    <Image
                      source={{ uri: posterUrl }}
                      style={dynamicStyles.knownForPoster}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[dynamicStyles.knownForPoster, dynamicStyles.posterPlaceholder]}>
                      <Ionicons name="film-outline" size={32} color={colors.textSecondary} />
                    </View>
                  )}
                  <Text style={dynamicStyles.knownForTitle} numberOfLines={2}>
                    {credit.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </>
  );

  return (
    <View style={dynamicStyles.container}>
      {/* Back button */}
      <View style={[dynamicStyles.backButtonContainer, { top: insets.top + Spacing.xs }]}>
        <Pressable onPress={handleGoBack} style={dynamicStyles.backButton}>
          <BlurView intensity={80} tint={effectiveTheme} style={dynamicStyles.blurButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </BlurView>
        </Pressable>
      </View>

      <FlatList<FilmographyItem>
        data={filmographyData}
        keyExtractor={getItemKey}
        renderItem={renderFilmographyItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={<View style={{ height: 90 }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={dynamicStyles.scrollContent}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={5}
      />
    </View>
  );
}

type ThemeColors = typeof Colors.dark;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: Spacing.xl,
    },

    // Loading
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Error
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
    },
    errorTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    errorSubtitle: {
      ...Typography.body.base,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    errorBackButton: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      backgroundColor: colors.tint,
      borderRadius: BorderRadius.md,
    },
    errorBackButtonText: {
      ...Typography.button.primary,
      color: Colors.dark.text,
    },

    // Back button
    backButtonContainer: {
      position: 'absolute',
      left: Spacing.md,
      zIndex: 10,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },
    blurButton: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Profile Header
    profileHeader: {
      alignItems: 'center',
      paddingTop: 80,
      paddingBottom: Spacing.xl,
      paddingHorizontal: Spacing.md,
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 4,
      borderColor: colors.tint,
      marginBottom: Spacing.md,
    },
    avatarPlaceholder: {
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personName: {
      ...Typography.display.h2,
      color: colors.text,
      textAlign: 'center',
    },
    personMeta: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
      marginBottom: Spacing.md,
      textAlign: 'center',
    },

    // Stats
    statsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    statBubble: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    statText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },

    // Sections
    section: {
      paddingHorizontal: Spacing.md,
    },
    sectionTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginTop: Spacing.lg,
      marginBottom: Spacing.md,
    },

    // Biography
    bioText: {
      ...Typography.body.base,
      color: colors.textSecondary,
      lineHeight: 24,
    },
    readMoreText: {
      ...Typography.body.smMedium,
      color: colors.tint,
    },

    // Known For
    knownForScroll: {
      marginHorizontal: -Spacing.md,
    },
    knownForScrollContent: {
      paddingHorizontal: Spacing.md,
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
      color: colors.text,
      fontWeight: '600',
    },
    posterPlaceholder: {
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Filmography
    filmographyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
      marginBottom: Spacing.md,
    },
    filmographyHeaderInList: {
      paddingHorizontal: Spacing.md,
    },
    sectionTitleNoMargin: {
      ...Typography.display.h4,
      color: colors.text,
    },
    countBadge: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
    },
    countBadgeText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
    filmographyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: Spacing.md,
    },
    filmographyRowInList: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: Spacing.md,
    },
    filmographyPoster: {
      width: 50,
      height: 75,
      borderRadius: BorderRadius.sm,
    },
    filmographyInfo: {
      flex: 1,
    },
    filmographyTitle: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '600',
      marginBottom: 2,
    },
    filmographyCharacter: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    filmographyYear: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },

    // Episode Badge
    episodeBadge: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
    },
    episodeBadgeText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
  });
