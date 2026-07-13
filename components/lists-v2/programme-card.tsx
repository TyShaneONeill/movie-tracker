/**
 * Programme card — one list on the Lists tab (contract A). Title + count fine
 * print + poster presence (Pile for Watchlist, FannedHand for Watching/custom).
 * The empty Watching card compresses to title + a one-line invitation (no dashed
 * void). Tap opens the list.
 */

import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { Chip } from '@/components/first-takes-v2/chip';
import { PileStatic } from './pile-static';
import { FannedHand } from './fanned-hand';
import { PileDeck } from './pile-deck';
import type { DeckItem } from './pile-card';

export interface ProgrammeCardProps {
  title: string;
  /** Formatted count line, e.g. "19 films deep" / "1 film · 3 shows" / "7 films". */
  count: string;
  /** 'deck' = interactive Watchlist pile (drag cycles; tap opens the list). */
  variant: 'pile' | 'fan' | 'deck';
  posterPaths: (string | null)[];
  /** Deck items — required for variant 'deck'. */
  deckItems?: DeckItem[];
  /** Numeric total — drives Pile depth / FannedHand "+N". */
  totalCount: number;
  /** Rose NOW PLAYING chip (Watching). */
  nowPlaying?: boolean;
  /** Small line under the poster area, e.g. "Severance · Next S2 E5" or a tagline. */
  fineprint?: string;
  /** Optional outline chip beside the fineprint (e.g. "TV"). */
  fineprintChip?: string;
  /** FannedHand jitter override (Watching uses a livelier fan). */
  jitter?: number;
  /** Compressed empty state — title + invitation, no poster area (Watching, 0 items). */
  empty?: boolean;
  emptyInvitation?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function ProgrammeCard({
  title,
  count,
  variant,
  posterPaths,
  deckItems,
  totalCount,
  nowPlaying,
  fineprint,
  fineprintChip,
  jitter,
  empty,
  emptyInvitation,
  onPress,
  accessibilityLabel,
}: ProgrammeCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}, ${count}`}
      // Hold the press-dim briefly so a horizontal deck drag (which activates the
      // Pan only after ~12px) doesn't flash the card dim at drag-start. Delays
      // the visual only — tap-to-open is unaffected.
      unstable_pressDelay={80}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {nowPlaying && (
          <View style={styles.nowPlaying}>
            <Chip label="Now Playing" color={colors.tint} border={colors.tint} />
          </View>
        )}
        <Text style={[styles.count, { color: colors.textTertiary }]}>{count}</Text>
      </View>

      {empty ? (
        <Text style={[styles.invite, { color: colors.textSecondary }]}>{emptyInvitation}</Text>
      ) : (
        <>
          {variant === 'deck' ? (
            // Live deck: drags cycle the pile; taps have no handler here so they
            // fall through to THIS card's Pressable → open the Watchlist detail.
            <View style={styles.deckSlot}>
              <PileDeck items={deckItems ?? []} />
            </View>
          ) : variant === 'pile' ? (
            <PileStatic posterPaths={posterPaths} count={totalCount} />
          ) : (
            <FannedHand posterPaths={posterPaths} count={totalCount} jitter={jitter} />
          )}
          {fineprint && (
            <View style={styles.fineprintRow}>
              <Text style={[styles.fineprint, { color: colors.textTertiary }]} numberOfLines={1}>
                {fineprint}
              </Text>
              {fineprintChip && (
                <Chip label={fineprintChip} color={colors.textSecondary} border={colors.border} />
              )}
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  nowPlaying: {
    flexShrink: 0,
  },
  count: {
    marginLeft: 'auto',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  deckSlot: {
    marginTop: 8,
  },
  invite: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 19,
  },
  fineprintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  fineprint: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
});
