import React, { useEffect, useReducer, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSeasonEpisodes } from '@/hooks/use-season-episodes';
import { SwipeToConfirm } from '@/components/ui/swipe-to-confirm';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import type { TMDBEpisode } from '@/lib/tmdb.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchedSelectionResult {
  fullySelectedSeasons: { seasonNumber: number; episodes: TMDBEpisode[] }[];
  partialSeasons: { seasonNumber: number; episodes: TMDBEpisode[] }[];
  totalEpisodesSelected: number;
  isComplete: boolean;
}

export interface TvWatchedSelectionModalProps {
  visible: boolean;
  show: {
    id: string;
    tmdbId: number;
    name: string;
    numberOfSeasons: number;
    numberOfEpisodes: number;
    episodesWatched: number;
  };
  onClose: () => void;
  onConfirm: (result: WatchedSelectionResult) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Selection state reducer
// ---------------------------------------------------------------------------

interface SelectionState {
  selectedSeasons: number[];
  partialEpisodes: Record<number, number[]>;
}

type SelectionAction =
  | { type: 'TOGGLE_SEASON'; seasonNumber: number; allEpisodeNumbers: number[] }
  | { type: 'TOGGLE_EPISODE'; seasonNumber: number; episodeNumber: number; allEpisodeNumbers: number[] }
  | { type: 'SELECT_ALL'; seasonNumbers: number[] }
  | { type: 'CLEAR' };

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'TOGGLE_SEASON': {
      const { seasonNumber } = action;
      const isFully = state.selectedSeasons.includes(seasonNumber);
      if (isFully) {
        return {
          ...state,
          selectedSeasons: state.selectedSeasons.filter((s) => s !== seasonNumber),
        };
      }
      const partial = { ...state.partialEpisodes };
      delete partial[seasonNumber];
      return { selectedSeasons: [...state.selectedSeasons, seasonNumber], partialEpisodes: partial };
    }

    case 'TOGGLE_EPISODE': {
      const { seasonNumber, episodeNumber, allEpisodeNumbers } = action;
      const isFully = state.selectedSeasons.includes(seasonNumber);

      if (isFully) {
        // Downgrade to partial — remove the one episode
        const remaining = allEpisodeNumbers.filter((n) => n !== episodeNumber);
        const selectedSeasons = state.selectedSeasons.filter((s) => s !== seasonNumber);
        if (remaining.length === 0) {
          return { selectedSeasons, partialEpisodes: state.partialEpisodes };
        }
        return {
          selectedSeasons,
          partialEpisodes: { ...state.partialEpisodes, [seasonNumber]: remaining },
        };
      }

      const current = state.partialEpisodes[seasonNumber] ?? [];
      const alreadySelected = current.includes(episodeNumber);

      if (alreadySelected) {
        const next = current.filter((e) => e !== episodeNumber);
        const partial = { ...state.partialEpisodes };
        if (next.length === 0) {
          delete partial[seasonNumber];
        } else {
          partial[seasonNumber] = next;
        }
        return { ...state, partialEpisodes: partial };
      } else {
        const next = [...current, episodeNumber];
        if (next.length === allEpisodeNumbers.length) {
          // Promote to fully selected
          const partial = { ...state.partialEpisodes };
          delete partial[seasonNumber];
          return {
            selectedSeasons: [...state.selectedSeasons, seasonNumber],
            partialEpisodes: partial,
          };
        }
        return { ...state, partialEpisodes: { ...state.partialEpisodes, [seasonNumber]: next } };
      }
    }

    case 'SELECT_ALL':
      return { selectedSeasons: action.seasonNumbers, partialEpisodes: {} };

    case 'CLEAR':
      return { selectedSeasons: [], partialEpisodes: {} };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// ModalSeasonRow
// ---------------------------------------------------------------------------

interface ModalSeasonRowProps {
  showId: number;
  seasonNumber: number;
  isVisible: boolean;
  isFullySelected: boolean;
  selectedEpisodeNumbers: number[];
  isExpanded: boolean;
  onToggleSeason: (seasonNumber: number, allEpisodeNumbers: number[]) => void;
  onToggleEpisode: (seasonNumber: number, episodeNumber: number, allEpisodeNumbers: number[]) => void;
  onToggleExpand: (seasonNumber: number) => void;
  onEpisodesLoaded: (seasonNumber: number, episodes: TMDBEpisode[]) => void;
}

function ModalSeasonRow({
  showId,
  seasonNumber,
  isVisible,
  isFullySelected,
  selectedEpisodeNumbers,
  isExpanded,
  onToggleSeason,
  onToggleEpisode,
  onToggleExpand,
  onEpisodesLoaded,
}: ModalSeasonRowProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { episodes, isLoading, isError } = useSeasonEpisodes({
    showId,
    seasonNumber,
    enabled: isVisible,
  });

  // Report episodes to parent once loaded
  useEffect(() => {
    if (episodes.length > 0) {
      onEpisodesLoaded(seasonNumber, episodes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes]);

  const allEpisodeNumbers = useMemo(
    () => episodes.map((ep) => ep.episode_number),
    [episodes]
  );

  const handleToggleSeason = useCallback(() => {
    onToggleSeason(seasonNumber, allEpisodeNumbers);
  }, [seasonNumber, allEpisodeNumbers, onToggleSeason]);

  const handleToggleExpand = useCallback(() => {
    onToggleExpand(seasonNumber);
  }, [seasonNumber, onToggleExpand]);

  const isPartial =
    !isFullySelected &&
    selectedEpisodeNumbers.length > 0 &&
    selectedEpisodeNumbers.length < (episodes.length || 1);

  const canToggleSeason = !isLoading && !isError && episodes.length > 0;

  const seasonButtonLabel = isFullySelected
    ? `✓ Season ${seasonNumber} ✓`
    : `Mark Season ${seasonNumber}`;

  return (
    <View style={styles.seasonItem}>
      {/* Season row header */}
      <View style={styles.seasonRow}>
        <Pressable
          onPress={handleToggleExpand}
          style={styles.seasonHeaderPressable}
          accessibilityRole="button"
          accessibilityLabel={`Season ${seasonNumber}, ${isExpanded ? 'collapse' : 'expand'}`}
        >
          <Text style={styles.seasonExpander}>{isExpanded ? '▼' : '▶'}</Text>
          <View style={styles.seasonInfo}>
            <Text style={styles.seasonTitle}>Season {seasonNumber}</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.tint} style={styles.seasonLoader} />
            ) : (
              <Text style={styles.seasonEpCount}>
                {episodes.length > 0
                  ? `${episodes.length} episode${episodes.length !== 1 ? 's' : ''}`
                  : isError
                  ? 'Could not load'
                  : ''}
              </Text>
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={handleToggleSeason}
          disabled={!canToggleSeason}
          style={({ pressed }) => [
            styles.markSeasonButton,
            isFullySelected && { backgroundColor: colors.tint },
            isPartial && { borderColor: colors.tint },
            pressed && { opacity: 0.7 },
            !canToggleSeason && { opacity: 0.3 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={seasonButtonLabel}
        >
          <Text
            style={[
              styles.markSeasonText,
              isFullySelected && { color: '#fff' },
              isPartial && { color: colors.tint },
            ]}
            numberOfLines={1}
          >
            {isFullySelected
              ? `✓ All ${episodes.length}`
              : isPartial
              ? `${selectedEpisodeNumbers.length}/${episodes.length}`
              : 'Mark All'}
          </Text>
        </Pressable>
      </View>

      {/* Episode grid (expanded) */}
      {isExpanded && (
        <View style={styles.episodeGrid}>
          {isLoading ? (
            <View style={styles.episodeLoadingRow}>
              {[...Array(6)].map((_, i) => (
                <View key={i} style={[styles.episodePillSkeleton, { backgroundColor: colors.backgroundSecondary }]} />
              ))}
            </View>
          ) : isError ? (
            <Text style={[styles.episodeErrorText, { color: colors.textSecondary }]}>
              Episode data unavailable
            </Text>
          ) : (
            <View style={styles.episodePillWrap}>
              {episodes.map((ep) => {
                const isChecked =
                  isFullySelected || selectedEpisodeNumbers.includes(ep.episode_number);
                return (
                  <Pressable
                    key={ep.id}
                    onPress={() =>
                      onToggleEpisode(seasonNumber, ep.episode_number, allEpisodeNumbers)
                    }
                    style={({ pressed }) => [
                      styles.episodePill,
                      isChecked && { backgroundColor: colors.tint },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={`Episode ${ep.episode_number}: ${ep.name}`}
                  >
                    <Text
                      style={[
                        styles.episodePillText,
                        { color: isChecked ? '#fff' : colors.textSecondary },
                      ]}
                    >
                      E{ep.episode_number}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TvWatchedSelectionModal
// ---------------------------------------------------------------------------

export function TvWatchedSelectionModal({
  visible,
  show,
  onClose,
  onConfirm,
}: TvWatchedSelectionModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selection, dispatch] = useReducer(selectionReducer, {
    selectedSeasons: [],
    partialEpisodes: {},
  });

  const [expandedSeasons, setExpandedSeasons] = useState<number[]>([]);
  const [seasonEpisodeData, setSeasonEpisodeData] = useState<Record<number, TMDBEpisode[]>>({});

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      dispatch({ type: 'CLEAR' });
      setExpandedSeasons([]);
      setSeasonEpisodeData({});
    }
  }, [visible]);

  const seasonNumbers = useMemo(
    () => Array.from({ length: show.numberOfSeasons }, (_, i) => i + 1),
    [show.numberOfSeasons]
  );

  const handleEpisodesLoaded = useCallback((seasonNumber: number, episodes: TMDBEpisode[]) => {
    setSeasonEpisodeData((prev) => ({ ...prev, [seasonNumber]: episodes }));
  }, []);

  const handleToggleSeason = useCallback(
    (seasonNumber: number, allEpisodeNumbers: number[]) => {
      dispatch({ type: 'TOGGLE_SEASON', seasonNumber, allEpisodeNumbers });
    },
    []
  );

  const handleToggleEpisode = useCallback(
    (seasonNumber: number, episodeNumber: number, allEpisodeNumbers: number[]) => {
      dispatch({ type: 'TOGGLE_EPISODE', seasonNumber, episodeNumber, allEpisodeNumbers });
    },
    []
  );

  const handleToggleExpand = useCallback((seasonNumber: number) => {
    setExpandedSeasons((prev) =>
      prev.includes(seasonNumber)
        ? prev.filter((s) => s !== seasonNumber)
        : [...prev, seasonNumber]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    dispatch({ type: 'SELECT_ALL', seasonNumbers });
  }, [seasonNumbers]);

  // Compute running total
  const totalSelected = useMemo(() => {
    let count = 0;
    for (const sn of selection.selectedSeasons) {
      count += (seasonEpisodeData[sn] ?? []).length;
    }
    for (const eps of Object.values(selection.partialEpisodes)) {
      count += eps.length;
    }
    return count;
  }, [selection, seasonEpisodeData]);

  const isAllSelected = useMemo(
    () =>
      seasonNumbers.every((sn) => selection.selectedSeasons.includes(sn)),
    [seasonNumbers, selection.selectedSeasons]
  );

  const handleConfirm = useCallback(async () => {
    const result: WatchedSelectionResult = {
      fullySelectedSeasons: selection.selectedSeasons.map((sn) => ({
        seasonNumber: sn,
        episodes: seasonEpisodeData[sn] ?? [],
      })),
      partialSeasons: Object.entries(selection.partialEpisodes)
        .filter(([, eps]) => eps.length > 0)
        .map(([sn, epNumbers]) => ({
          seasonNumber: Number(sn),
          episodes: (seasonEpisodeData[Number(sn)] ?? []).filter((ep) =>
            epNumbers.includes(ep.episode_number)
          ),
        })),
      totalEpisodesSelected: totalSelected,
      isComplete: totalSelected >= show.numberOfEpisodes && show.numberOfEpisodes > 0,
    };
    await onConfirm(result);
  }, [selection, seasonEpisodeData, totalSelected, show.numberOfEpisodes, onConfirm]);

  const swipeLabel =
    totalSelected > 0
      ? `Slide to confirm ${totalSelected} episode${totalSelected !== 1 ? 's' : ''}`
      : 'Select episodes above';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        {/* Backdrop */}
        <Pressable style={styles.overlay} onPress={onClose} />

        {/* Sheet content */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            Which parts of {show.name} have you seen?
          </Text>

          {/* "Yes, every episode" fast path */}
          <Pressable
            onPress={handleSelectAll}
            style={({ pressed }) => [
              styles.selectAllButton,
              isAllSelected && { backgroundColor: `${colors.tint}20`, borderColor: colors.tint },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Select all ${show.numberOfEpisodes} episodes`}
          >
            <Text style={[styles.selectAllText, { color: isAllSelected ? colors.tint : colors.textSecondary }]}>
              {isAllSelected
                ? `✓ All ${show.numberOfEpisodes} episodes selected`
                : `Yes, every episode (${show.numberOfEpisodes} total)`}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Season list */}
          <ScrollView
            style={styles.seasonList}
            contentContainerStyle={styles.seasonListContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {seasonNumbers.map((sn) => (
              <ModalSeasonRow
                key={sn}
                showId={show.tmdbId}
                seasonNumber={sn}
                isVisible={visible}
                isFullySelected={selection.selectedSeasons.includes(sn)}
                selectedEpisodeNumbers={selection.partialEpisodes[sn] ?? []}
                isExpanded={expandedSeasons.includes(sn)}
                onToggleSeason={handleToggleSeason}
                onToggleEpisode={handleToggleEpisode}
                onToggleExpand={handleToggleExpand}
                onEpisodesLoaded={handleEpisodesLoaded}
              />
            ))}
          </ScrollView>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Running count */}
          {totalSelected > 0 && (
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              Adding {totalSelected} episode{totalSelected !== 1 ? 's' : ''} to your history
            </Text>
          )}

          {/* Swipe to confirm */}
          <View style={styles.swipeContainer}>
            <SwipeToConfirm
              label={swipeLabel}
              onConfirm={handleConfirm}
              disabled={totalSelected === 0}
            />
          </View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type ThemeColors = typeof Colors.dark;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    gestureRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      maxHeight: '88%',
      paddingBottom: Spacing.xxl,
    },
    handleContainer: {
      alignItems: 'center',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
    },
    title: {
      ...Typography.display.h3,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    selectAllButton: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      alignItems: 'center',
    },
    selectAllText: {
      ...Typography.body.sm,
      fontWeight: '600',
    },
    divider: {
      height: 1,
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.xs,
    },
    seasonList: {
      flexGrow: 0,
      maxHeight: 360,
    },
    seasonListContent: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xs,
    },
    countText: {
      ...Typography.body.sm,
      textAlign: 'center',
      paddingVertical: Spacing.xs,
    },
    swipeContainer: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
    },

    // Season row
    seasonItem: {
      marginBottom: Spacing.xs,
    },
    seasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
    },
    seasonHeaderPressable: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    seasonExpander: {
      color: colors.textTertiary,
      fontSize: 10,
      width: 14,
    },
    seasonInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    seasonTitle: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '600',
    },
    seasonEpCount: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    seasonLoader: {
      marginLeft: Spacing.xs,
    },
    markSeasonButton: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
      minWidth: 76,
      alignItems: 'center',
    },
    markSeasonText: {
      ...Typography.caption.default,
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 11,
    },

    // Episode grid
    episodeGrid: {
      paddingLeft: 22,
      paddingBottom: Spacing.sm,
    },
    episodePillWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    episodePillSkeleton: {
      width: 36,
      height: 28,
      borderRadius: BorderRadius.sm,
      marginRight: Spacing.xs,
      marginBottom: Spacing.xs,
    },
    episodeLoadingRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    episodePill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.sm,
      backgroundColor: 'rgba(255, 255, 255, 0.07)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    episodePillText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    episodeErrorText: {
      ...Typography.caption.default,
      fontStyle: 'italic',
      paddingVertical: Spacing.xs,
    },
  });
