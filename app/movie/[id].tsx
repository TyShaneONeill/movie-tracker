/**
 * Movie Detail Screen
 * Matches ui-mocks/movie_detail.html
 *
 * Features:
 * - Hero banner with backdrop image and gradient overlay
 * - Glassmorphism back/more buttons
 * - Centered play trailer button
 * - Content overlaps hero by 120px
 * - Poster thumbnail + title/year/runtime + rating/tags
 * - 4-column action grid (Like, Save, Review, Share)
 * - Top Cast horizontal scroll with circular avatars
 * - Where to Watch section with streaming service cards
 * - Action sheet modal for more options
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import BottomSheetModal, { BottomSheetModalHandle } from '@/components/ui/bottom-sheet-modal';

// Mock data for the movie (in real app, fetch by ID)
const MOCK_MOVIE = {
  id: '1',
  title: 'Dune: Part Two',
  year: '2024',
  runtime: '2h 46m',
  rating: 8.8,
  genres: ['Sci-Fi', 'Action'],
  synopsis: 'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.',
  backdropUrl: 'https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  posterUrl: 'https://image.tmdb.org/t/p/w200/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  cast: [
    { name: 'Timothée', character: 'Paul', imageUrl: 'https://image.tmdb.org/t/p/w200/lFDe5Fj28u10y8yqecjW1k06j5.jpg' },
    { name: 'Zendaya', character: 'Chani', imageUrl: 'https://image.tmdb.org/t/p/w200/x7wF55v96F5Xf1C5v5v1e7H7.jpg' },
    { name: 'Rebecca', character: 'Jessica', imageUrl: 'https://image.tmdb.org/t/p/w200/uF5W7xXk5.jpg' },
    { name: 'Josh', character: 'Gurney', imageUrl: 'https://image.tmdb.org/t/p/w200/h5X8G5.jpg' },
  ],
};

export default function MovieDetailScreen() {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(false);
  const bottomSheetRef = useRef<BottomSheetModalHandle>(null);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handlePlayTrailer = () => {
    // Placeholder for playing trailer
    console.log('Playing trailer...');
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
  };

  const handleSave = () => {
    // Navigate to add to list modal
    console.log('Add to list...');
  };

  const handleReview = () => {
    // Navigate to review modal
    console.log('Write review...');
  };

  const handleShare = () => {
    console.log('Share movie...');
  };

  const showMoreOptionsSheet = () => {
    bottomSheetRef.current?.present();
  };

  const hideMoreOptionsSheet = () => {
    bottomSheetRef.current?.dismiss();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <ImageBackground
          source={{ uri: MOCK_MOVIE.backdropUrl }}
          style={styles.heroBanner}
          resizeMode="cover"
        >
          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.3)', 'transparent', Colors.dark.background]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Top Buttons */}
          <View style={styles.topButtons}>
            <Pressable onPress={handleGoBack} style={styles.iconButton}>
              <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
                <Text style={styles.backIcon}>←</Text>
              </BlurView>
            </Pressable>
            <Pressable onPress={showMoreOptionsSheet} style={styles.iconButton}>
              <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
                <Text style={styles.moreIcon}>⋯</Text>
              </BlurView>
            </Pressable>
          </View>

          {/* Play Button */}
          <Pressable onPress={handlePlayTrailer} style={styles.playButton}>
            <BlurView intensity={10} tint="dark" style={styles.playButtonBlur}>
              <Text style={styles.playIcon}>▶</Text>
            </BlurView>
          </Pressable>
        </ImageBackground>

        {/* Content Container - Overlaps hero by 120px */}
        <View style={styles.contentContainer}>
          {/* Poster + Title Section */}
          <View style={styles.posterSection}>
            <Image
              source={{ uri: MOCK_MOVIE.posterUrl }}
              style={styles.posterThumb}
              resizeMode="cover"
            />
            <View style={styles.titleSection}>
              <Text style={styles.title}>{MOCK_MOVIE.title}</Text>
              <Text style={styles.metadata}>
                {MOCK_MOVIE.year} • {MOCK_MOVIE.runtime}
              </Text>
              <View style={styles.ratingTags}>
                <Text style={styles.rating}>★ {MOCK_MOVIE.rating}</Text>
                {MOCK_MOVIE.genres.map((genre, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Synopsis */}
          <Text style={styles.synopsis}>{MOCK_MOVIE.synopsis}</Text>

          {/* Action Grid */}
          <View style={styles.actionGrid}>
            <Pressable onPress={handleLike} style={styles.actionItem}>
              <Text style={[styles.actionIcon, isLiked && styles.actionIconLiked]}>♥</Text>
              <Text style={styles.actionLabel}>Like</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={styles.actionItem}>
              <Text style={styles.actionIcon}>🔖</Text>
              <Text style={styles.actionLabel}>Save</Text>
            </Pressable>
            <Pressable onPress={handleReview} style={styles.actionItem}>
              <Text style={styles.actionIcon}>💬</Text>
              <Text style={styles.actionLabel}>Review</Text>
            </Pressable>
            <Pressable onPress={handleShare} style={styles.actionItem}>
              <Text style={styles.actionIcon}>🔗</Text>
              <Text style={styles.actionLabel}>Share</Text>
            </Pressable>
          </View>

          {/* Top Cast Section */}
          <Text style={styles.sectionTitle}>Top Cast</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.castScroll}
            contentContainerStyle={styles.castScrollContent}
          >
            {MOCK_MOVIE.cast.map((person, index) => (
              <Pressable key={index} style={styles.castCard}>
                <Image
                  source={{ uri: person.imageUrl }}
                  style={styles.castImage}
                  resizeMode="cover"
                />
                <Text style={styles.castName}>{person.name}</Text>
                <Text style={styles.castCharacter}>{person.character}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Where to Watch Section */}
          <Text style={[styles.sectionTitle, styles.streamingSectionTitle]}>
            Where to Watch
          </Text>

          <Pressable style={styles.streamingService}>
            <View style={styles.streamingIcon}>
              <Text style={styles.streamingIconText}>MAX</Text>
            </View>
            <View style={styles.streamingInfo}>
              <Text style={styles.streamingName}>Stream on Max</Text>
              <Text style={styles.streamingType}>Subscription</Text>
            </View>
            <Text style={styles.chevronIcon}>→</Text>
          </Pressable>

          <Pressable style={styles.streamingService}>
            <View style={[styles.streamingIcon, styles.rentIcon]}>
              <Text style={styles.rentIconText}>💳</Text>
            </View>
            <View style={styles.streamingInfo}>
              <Text style={styles.streamingName}>Rent or Buy</Text>
              <Text style={styles.streamingType}>From $19.99</Text>
            </View>
            <Text style={styles.chevronIcon}>→</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Action Sheet Modal */}
      <BottomSheetModal ref={bottomSheetRef}>
        <View style={styles.actionSheet}>
          <Pressable
            style={styles.sheetOption}
            onPress={() => {
              hideMoreOptionsSheet();
              handleShare();
            }}
          >
            <Text style={styles.sheetIcon}>📤</Text>
            <Text style={styles.sheetLabel}>Share Movie</Text>
          </Pressable>
          <Pressable
            style={styles.sheetOption}
            onPress={() => {
              hideMoreOptionsSheet();
              handleSave();
            }}
          >
            <Text style={styles.sheetIcon}>➕</Text>
            <Text style={styles.sheetLabel}>Add to List</Text>
          </Pressable>
          <Pressable
            style={[styles.sheetOption, styles.sheetOptionLast]}
            onPress={() => {
              hideMoreOptionsSheet();
              console.log('Report issue...');
            }}
          >
            <Text style={styles.sheetIcon}>⚠️</Text>
            <Text style={[styles.sheetLabel, styles.sheetLabelDanger]}>Report Issue</Text>
          </Pressable>
          <Pressable
            style={styles.cancelButton}
            onPress={hideMoreOptionsSheet}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },

  // Hero Banner Styles
  heroBanner: {
    height: 480,
    width: '100%',
    position: 'relative',
  },
  topButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 60, // Account for status bar
    zIndex: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: BorderRadius.full,
  },
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
  },
  backIcon: {
    fontSize: 24,
    color: '#fff',
  },
  moreIcon: {
    fontSize: 24,
    color: '#fff',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -36 }, { translateY: -36 }],
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    zIndex: 20,
  },
  playButtonBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
  },
  playIcon: {
    fontSize: 32,
    color: '#fff',
    marginLeft: 4, // Visual centering
  },

  // Content Container
  contentContainer: {
    marginTop: -120, // Overlap hero by 120px
    paddingHorizontal: Spacing.md,
    zIndex: 10,
  },

  // Poster + Title Section
  posterSection: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-end',
  },
  posterThumb: {
    width: 130,
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  titleSection: {
    flex: 1,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display.h3,
    color: Colors.dark.text,
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  metadata: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  ratingTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  rating: {
    ...Typography.body.sm,
    color: Colors.dark.gold,
    fontWeight: '600',
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tagText: {
    ...Typography.tag.default,
    color: Colors.dark.textSecondary,
  },

  // Synopsis
  synopsis: {
    ...Typography.body.base,
    color: Colors.dark.textSecondary,
    lineHeight: 24,
    marginTop: Spacing.md,
  },

  // Action Grid
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  actionItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    fontSize: 24,
    color: Colors.dark.textSecondary,
  },
  actionIconLiked: {
    color: Colors.dark.tint,
  },
  actionLabel: {
    ...Typography.caption.default,
    color: Colors.dark.textSecondary,
  },

  // Cast Section
  sectionTitle: {
    ...Typography.display.h4,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  castScroll: {
    marginHorizontal: -Spacing.md,
  },
  castScrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  castCard: {
    width: 100,
    alignItems: 'center',
  },
  castImage: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.card,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  castName: {
    ...Typography.body.sm,
    color: Colors.dark.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  castCharacter: {
    ...Typography.caption.default,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },

  // Streaming Section
  streamingSectionTitle: {
    marginTop: Spacing.lg,
  },
  streamingService: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: Spacing.sm,
  },
  streamingIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#000',
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamingIconText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  rentIcon: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  rentIconText: {
    fontSize: 24,
  },
  streamingInfo: {
    flex: 1,
  },
  streamingName: {
    ...Typography.body.baseMedium,
    color: Colors.dark.text,
    fontWeight: '600',
  },
  streamingType: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
  },
  chevronIcon: {
    fontSize: 20,
    color: Colors.dark.textSecondary,
  },

  // Action Sheet
  actionSheet: {
    gap: 0,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sheetOptionLast: {
    borderBottomWidth: 0,
  },
  sheetIcon: {
    fontSize: 20,
  },
  sheetLabel: {
    ...Typography.body.base,
    color: Colors.dark.text,
  },
  sheetLabelDanger: {
    color: '#ff4444',
  },
  cancelButton: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.tint,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...Typography.button.primary,
    color: '#fff',
  },
});
