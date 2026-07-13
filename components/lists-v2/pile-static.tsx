/**
 * Static poster pile for the Watchlist programme card (contract A). The visible
 * depth grows with the list size (capped at 5 edges) — the endless-watchlist
 * joke made charming. Seeded rotations keep the tilt stable across re-renders.
 * Watchlist-ONLY treatment; custom lists use the calmer FannedHand.
 */

import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { seededRotation } from '@/lib/lists-v2-logic';

const CARD_W = 84;
const CARD_H = 118;
const STAGE_W = CARD_W + 44; // slack for rotation overhang; card centered numerically
const CARD_LEFT = (STAGE_W - CARD_W) / 2;
const MAX_EDGES = 5; // cap visual depth per contract A
const PEEK = 4; // px each edge rises behind the top card
const JITTER = 3; // deg

interface PileStaticProps {
  /** Ordered poster paths (top of the pile first). */
  posterPaths: (string | null)[];
  /** Total count — drives how many edges peek (capped at MAX_EDGES). */
  count: number;
}

export function PileStatic({ posterPaths, count }: PileStaticProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const layers = Math.min(Math.max(count, 1), MAX_EDGES);
  // Deepest first so the top card paints last (highest z-order).
  const indices = Array.from({ length: layers }, (_, i) => layers - 1 - i);

  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {indices.map((i) => {
        const isTop = i === 0;
        const rot = isTop ? 0 : seededRotation(i + 1) * JITTER;
        const posterUrl = getTMDBImageUrl(posterPaths[i] ?? null, 'w185');
        return (
          <View
            key={i}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: 1 - i * 0.1,
                transform: [
                  { translateY: -i * PEEK },
                  { rotate: `${rot.toFixed(2)}deg` },
                  { scale: 1 - i * 0.03 },
                ],
              },
            ]}
          >
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 126,
    width: STAGE_W,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    left: CARD_LEFT,
    bottom: 4,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
});
