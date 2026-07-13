/**
 * Fanned poster hand for the Watching + custom-list programme cards (contract
 * A). Overlapping posters with a gentle seeded tilt — calmer than the Watchlist
 * Pile. Custom lists get the calmest jitter (decision #2); Watching a touch
 * livelier. Tap-to-open only; no interactivity.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { seededRotation, FAN_JITTER_CUSTOM } from '@/lib/lists-v2-logic';

const CARD_W = 74;
const CARD_H = 110;
const OVERLAP = -20; // tighter overlap than the Pile
const MAX_SHOWN = 4;

interface FannedHandProps {
  posterPaths: (string | null)[];
  /** Max rotation in degrees. Defaults to the calm custom-list jitter. */
  jitter?: number;
  /** Total count — drives the trailing "+N" affordance when it exceeds shown. */
  count: number;
}

export function FannedHand({ posterPaths, jitter = FAN_JITTER_CUSTOM, count }: FannedHandProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const shown = posterPaths.slice(0, MAX_SHOWN);
  const remaining = count - shown.length;

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map((path, i) => {
        const rot = i === 0 ? 0 : seededRotation(i + 1) * jitter;
        const posterUrl = getTMDBImageUrl(path ?? null, 'w185');
        return (
          <View
            key={i}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginLeft: i === 0 ? 0 : OVERLAP,
                transform: [{ rotate: `${rot.toFixed(2)}deg` }, { translateY: i * 2 }],
                zIndex: i,
              },
            ]}
          >
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
            ) : null}
          </View>
        );
      })}
      {remaining > 0 && (
        <Text style={[styles.more, { color: colors.textTertiary }]}>+{remaining}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 116,
    paddingLeft: 4,
  },
  card: {
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
  more: {
    marginLeft: 10,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
});
