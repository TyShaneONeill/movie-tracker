/**
 * The interactive Watchlist swipe deck (contract A2, device round 1: moved to
 * the profile Lists-tab Watchlist card). Drag the top poster off → it flies
 * away, the pile rises, and the card cycles to the back (v1: non-destructive
 * shuffle). WINDOWED: a backlog of 100+ mounts only PILE.depth + 1 cards.
 *
 * `onOpen` is optional: omit it (as the Lists tab does) so a TAP falls through
 * to the enclosing card's open-the-list Pressable while drags still cycle.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';
import { cyclePileOrder, PILE } from '@/lib/lists-v2-logic';
import { PileCard, DECK_CARD_W, DECK_CARD_H, type DeckItem } from './pile-card';

interface PileDeckProps {
  items: DeckItem[];
  /** Optional — when omitted, taps fall through to the enclosing press target. */
  onOpen?: (item: DeckItem) => void;
}

export function PileDeck({ items, onOpen }: PileDeckProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const reduced = useReducedMotion();

  const [order, setOrder] = useState<DeckItem[]>(items);
  // Re-sync when the underlying list changes (add / remove / reorder).
  useEffect(() => {
    setOrder(items);
  }, [items]);

  const cycle = useCallback(() => {
    setOrder((prev) => cyclePileOrder(prev));
  }, []);

  const windowed = order.slice(0, PILE.depth + 1);
  // Render back-to-front so paint order agrees with zIndex on both platforms.
  const painted = windowed.map((item, pos) => ({ item, pos })).reverse();

  return (
    <View style={styles.stage}>
      {painted.map(({ item, pos }) => (
        <PileCard
          key={item.key}
          item={item}
          pos={pos}
          isTop={pos === 0}
          cyclable={order.length > 1}
          reduced={reduced}
          onThrow={cycle}
          onTap={onOpen}
          cardColor={colors.card}
          borderColor={colors.border}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: DECK_CARD_W,
    // Card height + headroom for the rise (depth * peek) so risen cards don't clip.
    height: DECK_CARD_H + PILE.depth * PILE.peek + 8,
    alignSelf: 'center',
  },
});
