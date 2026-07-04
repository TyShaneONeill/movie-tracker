import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Fonts } from '@/constants/theme';
import { useStatsColors } from '@/constants/stats-v2-theme';
import type { GenreStats } from '@/hooks/use-user-stats';
import { buildDisplayGenres, isOtherGenre as isOther } from './genre-display';

/**
 * Stats v2 Top Genres (design section 1D) — lives inside the Your Year card
 * under a 1px divider.
 *
 * A slim 10px split bar of genre segments (flex-weighted by the pre-computed
 * percentage), then a clickable 2-column legend: color dot + name + mono % +
 * chevron, separated by internal 1px dividers only (no boxes). Each segment
 * and row opens the genre's gated detail. Colors come from the theme's
 * `genrePalette`, assigned by index so a genre's color is stable for a given
 * ranking.
 */

function tapGenre(genre: GenreStats) {
  if (isOther(genre)) return; // "Other" has no single genre to drill into
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  router.push(
    `/analytics/genre?genreId=${genre.genreId}&genreName=${encodeURIComponent(genre.genreName)}`
  );
}

export function GenreBar({ genres }: { genres: GenreStats[] }) {
  const c = useStatsColors();

  if (genres.length === 0) return null;

  const displayGenres = buildDisplayGenres(genres);
  const colorFor = (genre: GenreStats, i: number) =>
    isOther(genre) ? c.genreOther : c.genrePalette[i % c.genrePalette.length];

  return (
    <View>
      {/* header */}
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, { color: c.ter }]}>TOP GENRES</Text>
        <Text style={[styles.hint, { color: c.faint }]}>tap to drill in</Text>
      </View>

      {/* slim split bar */}
      <View style={styles.splitBar}>
        {displayGenres.map((genre, i) => (
          <Pressable
            key={genre.genreId}
            accessibilityLabel={genre.genreName}
            disabled={isOther(genre)}
            onPress={() => tapGenre(genre)}
            // flex-weighted by percentage; floor at 1 so tiny genres stay visible
            style={[
              styles.segment,
              { flex: Math.max(genre.percentage, 1), backgroundColor: colorFor(genre, i) },
            ]}
          />
        ))}
      </View>

      {/* clickable legend — 2-column grid, internal dividers only */}
      <View style={styles.legend}>
        {displayGenres.map((genre, i) => {
          // Divider under every cell except the last row's — computed from the
          // row the cell sits in, so an odd count never leaves a half-width line.
          const lastRowStart = displayGenres.length - (displayGenres.length % 2 === 0 ? 2 : 1);
          const hasRowBelow = i < lastRowStart;
          const other = isOther(genre);
          return (
            <Pressable
              key={genre.genreId}
              disabled={other}
              onPress={() => tapGenre(genre)}
              style={({ pressed }) => [
                styles.legendItem,
                i % 2 === 0 ? styles.legendItemLeft : styles.legendItemRight,
                hasRowBelow && { borderBottomWidth: 1, borderBottomColor: c.line },
                pressed && !other && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: colorFor(genre, i) }]} />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[styles.legendName, { color: other ? c.sec : c.text }]}
              >
                {genre.genreName}
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.legendPct, { color: c.sec }]}>
                {genre.percentage}%
              </Text>
              {/* "Other" has nothing to drill into — omit the chevron */}
              {other ? (
                <View style={styles.chevronSpacer} />
              ) : (
                <Ionicons name="chevron-forward" size={13} color={c.faint} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eyebrow: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.5,
  },
  hint: {
    fontFamily: Fonts.inter.regular,
    fontSize: 11,
    lineHeight: 14,
  },
  splitBar: {
    flexDirection: 'row',
    gap: 3,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  segment: {
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  legendItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
  },
  legendItemLeft: {
    paddingRight: 9,
  },
  legendItemRight: {
    paddingLeft: 9,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendName: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.inter.medium,
    fontSize: 13,
    lineHeight: 17,
  },
  legendPct: {
    fontFamily: Fonts.mono.regular,
    fontSize: 12,
    lineHeight: 15,
  },
  // Reserves the chevron's width on the "Other" row so % columns stay aligned.
  chevronSpacer: {
    width: 13,
  },
});
