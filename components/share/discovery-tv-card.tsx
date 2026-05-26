import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius, Fonts, FontSizes } from '@/constants/theme';
import { getTMDBImageUrl } from '@/lib/tmdb.types';

// The app doesn't ship a custom monospace font, so fall back to platform defaults.
const MONO_FONT = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  web: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  default: 'monospace',
});

interface DiscoveryTvCardProps {
  showName: string;
  posterPath: string | null;
  firstAirYear?: string;
  tagline?: string;
  shareUrl: string;
}

const DiscoveryTvCard = React.forwardRef<View, DiscoveryTvCardProps>(
  ({ showName, posterPath, firstAirYear, tagline, shareUrl }, ref) => {
    const posterUrl = getTMDBImageUrl(posterPath, 'w500');

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Poster — large, centered */}
        <View style={styles.posterContainer}>
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Text style={styles.posterPlaceholderText}>No Poster</Text>
            </View>
          )}
        </View>

        {/* Title + optional year */}
        <Text style={styles.showName} numberOfLines={2}>
          {showName}
        </Text>
        {firstAirYear ? (
          <Text style={styles.firstAirYear}>{firstAirYear}</Text>
        ) : null}

        {/* Optional tagline */}
        {tagline ? (
          <Text style={styles.tagline} numberOfLines={2}>
            &ldquo;{tagline}&rdquo;
          </Text>
        ) : null}

        {/* Bottom branding + URL */}
        <View style={styles.bottomSection}>
          <Text style={styles.onPocketStubs}>On PocketStubs</Text>
          <Text style={styles.shareUrl} numberOfLines={1}>
            {shareUrl}
          </Text>
        </View>
      </View>
    );
  }
);

DiscoveryTvCard.displayName = 'DiscoveryTvCard';

const styles = StyleSheet.create({
  container: {
    width: 360,
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
  },
  posterContainer: {
    width: 200,
    height: 300,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.sm,
    color: Colors.dark.textTertiary,
  },
  showName: {
    fontFamily: Fonts.outfit.bold,
    fontSize: FontSizes['2xl'],
    lineHeight: 30,
    color: Colors.dark.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  firstAirYear: {
    fontFamily: Fonts.inter.medium,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.dark.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.md,
  },
  onPocketStubs: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: FontSizes.sm,
    color: Colors.dark.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  shareUrl: {
    fontFamily: MONO_FONT,
    fontSize: FontSizes.xs,
    color: Colors.dark.textTertiary,
  },
});

export { DiscoveryTvCard };
export default DiscoveryTvCard;
