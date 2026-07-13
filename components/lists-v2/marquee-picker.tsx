/**
 * Cover picker for "Set the marquee" (contract C). Reuses the list's own titles
 * as a tap-to-choose poster grid; picking one sets it as the list cover, or
 * "Use the smart default" clears the choice. Smallest correct surface — a bottom
 * sheet over the grid.
 */

import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { MediaKind } from '@/lib/lists-v2-logic';

export interface MarqueeCandidate {
  tmdbId: number;
  media: MediaKind;
  title: string;
  posterPath: string | null;
}

interface MarqueePickerProps {
  visible: boolean;
  candidates: MarqueeCandidate[];
  /** Currently chosen cover id (highlighted), or null for smart default. */
  chosenTmdbId: number | null;
  onPick: (tmdbId: number, media: MediaKind) => void;
  onUseSmartDefault: () => void;
  onClose: () => void;
}

export function MarqueePicker({
  visible,
  candidates,
  chosenTmdbId,
  onPick,
  onUseSmartDefault,
  onClose,
}: MarqueePickerProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />
        <Text style={[styles.heading, { color: colors.textSecondary }]}>Set the marquee</Text>

        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {candidates.map((c) => {
            const posterUrl = getTMDBImageUrl(c.posterPath, 'w342');
            const selected = c.tmdbId === chosenTmdbId;
            return (
              <Pressable
                key={`${c.media}:${c.tmdbId}`}
                onPress={() => onPick(c.tmdbId, c.media)}
                accessibilityRole="button"
                accessibilityLabel={`Set ${c.title} as list cover`}
                style={({ pressed }) => [
                  styles.cell,
                  { borderColor: selected ? colors.tint : 'transparent', opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Image
                  source={{ uri: posterUrl ?? undefined }}
                  style={[styles.poster, { backgroundColor: colors.card }]}
                  contentFit="cover"
                  transition={200}
                />
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={onUseSmartDefault}
          accessibilityRole="button"
          style={({ pressed }) => [styles.defaultBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.defaultText, { color: chosenTmdbId == null ? colors.tint : colors.textSecondary }]}>
            Use the smart default
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const CELL_GAP = 10;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  heading: {
    ...Typography.caption.medium,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },
  cell: {
    width: '30%',
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  defaultBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  defaultText: {
    ...Typography.button.primary,
  },
});
