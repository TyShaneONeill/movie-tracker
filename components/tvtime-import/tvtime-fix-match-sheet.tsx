import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';

import type { TMDBMovie } from '@/lib/tmdb.types';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { TicketMovieSearchResult } from '@/components/ticket-movie-search-result';
import type { PersistedReviewItem } from '@/lib/tvtime-import';
import { SearchIcon } from './icons';

// Android needs BottomSheetTextInput for keyboard handling inside the sheet.
const SheetTextInput = Platform.OS === 'android' ? BottomSheetTextInput : TextInput;

interface TvTimeFixMatchSheetProps {
  visible: boolean;
  item: PersistedReviewItem | null;
  onSelect: (movie: TMDBMovie) => void;
  onNoneOfThese: () => void;
  onClose: () => void;
}

/**
 * "Needs a look" fix-a-match sheet (mock frame 6). Opens the app's standard
 * movie search — pre-filled with the export title — so the user can re-link an
 * imported movie the matcher couldn't place. Reuses {@link useMovieSearch} and
 * {@link TicketMovieSearchResult} wholesale. "None of these" leaves the item
 * unresolved rather than forcing a wrong match.
 */
export function TvTimeFixMatchSheet({ visible, item, onSelect, onNoneOfThese, onClose }: TvTimeFixMatchSheetProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['90%'], []);

  const [query, setQuery] = useState('');
  // Seed the search with the export title each time a new item opens the sheet.
  useEffect(() => {
    if (item) setQuery(item.title);
  }, [item]);

  const debounced = useDebouncedValue(query, 300);
  const { movies, isLoading } = useMovieSearch({
    query: debounced,
    enabled: visible && debounced.trim().length >= 2,
  });
  const results = useMemo(() => movies.slice(0, 8), [movies]);

  const year = item?.releaseDate ? item.releaseDate.slice(0, 4) : null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.backdropOverlay} />
        </Pressable>

        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          onClose={onClose}
          enablePanDownToClose
          backgroundStyle={{ backgroundColor: colors.background }}
          handleIndicatorStyle={{ backgroundColor: colors.textTertiary }}
        >
          <View style={styles.header}>
            <Text style={[Typography.display.h4, { color: colors.text }]}>Needs a look</Text>
          </View>

          <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>From your export:</Text>
            <Text style={[Typography.body.lg, styles.exportTitle, { color: colors.text }]}>
              {item?.title ?? ''}
              {year ? <Text style={{ color: colors.textTertiary, fontWeight: '400' }}> ({year})</Text> : null}
            </Text>

            <View style={[styles.searchRow, { backgroundColor: colors.backgroundSecondary }]}>
              <SearchIcon color={colors.textTertiary} size={16} />
              <SheetTextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search movies…"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                returnKeyType="search"
              />
            </View>

            {isLoading && (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.tint} />
              </View>
            )}

            {results.map((movie) => (
              <TicketMovieSearchResult key={movie.id} movie={movie} onSelect={onSelect} />
            ))}

            {!isLoading && debounced.trim().length >= 2 && results.length === 0 && (
              <Text style={[Typography.body.sm, styles.empty, { color: colors.textTertiary }]}>
                No matches found. Try a different title.
              </Text>
            )}

            <Pressable
              onPress={onNoneOfThese}
              style={({ pressed }) => [styles.noneButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text style={[Typography.body.sm, { color: colors.textSecondary, fontWeight: '600' }]}>
                None of these
              </Text>
            </Pressable>
            <Text style={[Typography.body.sm, styles.hint, { color: colors.textTertiary }]}>
              Leaving it unresolved keeps it safe — never a wrong forced match.
            </Text>
          </BottomSheetScrollView>
        </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: { flex: 1 },
    backdrop: { ...StyleSheet.absoluteFillObject },
    backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
    header: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    body: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xxl },
    exportTitle: { fontWeight: '800', marginTop: 3, marginBottom: Spacing.md },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
    },
    searchInput: { flex: 1, ...Typography.body.base, padding: 0 },
    loading: { paddingVertical: Spacing.lg },
    empty: { textAlign: 'center', paddingVertical: Spacing.lg },
    noneButton: {
      marginTop: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    hint: { textAlign: 'center', marginTop: Spacing.sm },
  });
}
