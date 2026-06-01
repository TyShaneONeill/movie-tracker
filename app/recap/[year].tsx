import { useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import ViewShot from 'react-native-view-shot';

import { useYearRecap, type YearRecap } from '@/hooks/use-year-recap';
import { YearRecapPoster } from '@/components/recap/year-recap-poster';
import { shareRecap } from '@/lib/share-service';

const THIN_YEAR_MIN_FILMS = 5;

// Dev-only fixtures for forced-state QA (?preview=full|sparse|empty).
const PREVIEW_FIXTURES: Record<string, YearRecap> = {
  full: {
    year: 2025, filmsSeen: 47, hoursWatched: 5640,
    genres: [{ genreId: 878, genreName: 'Sci-Fi', count: 12 }],
    tvShows: 8, episodesWatched: 112, tvHours: 3360,
    formats: [{ format: 'imax', count: 12 }, { format: 'dolby', count: 4 }],
    theatersCount: 7, chainsCount: 3,
    firstFilm: { title: 'Oppenheimer', date: '2025-01-03' },
    lastFilm: { title: 'Nosferatu', date: '2025-12-29' },
    availableYears: [2025, 2024],
  },
  sparse: {
    year: 2025, filmsSeen: 23, hoursWatched: 2700,
    genres: [{ genreId: 18, genreName: 'Drama', count: 6 }],
    tvShows: 0, episodesWatched: 0, tvHours: 0,
    formats: [], theatersCount: 0, chainsCount: 0,
    firstFilm: { title: 'Past Lives', date: '2025-02-10' },
    lastFilm: { title: 'The Brutalist', date: '2025-11-20' },
    availableYears: [2025],
  },
  empty: {
    year: 2025, filmsSeen: 0, hoursWatched: 0, genres: [],
    tvShows: 0, episodesWatched: 0, tvHours: 0, formats: [],
    theatersCount: 0, chainsCount: 0, firstFilm: null, lastFilm: null,
    availableYears: [],
  },
};

export default function RecapScreen() {
  const params = useLocalSearchParams<{ year?: string; preview?: string }>();
  const year = Number(params.year) || new Date().getFullYear() - 1;
  const viewShotRef = useRef<ViewShot>(null);

  const previewKey = __DEV__ && params.preview ? params.preview : undefined;
  const previewData = previewKey ? PREVIEW_FIXTURES[previewKey] : undefined;

  const query = useYearRecap(year);
  const recap = previewData ?? query.data;
  const isLoading = !previewData && query.isLoading;
  const isError = !previewData && query.isError;

  const onShare = useMemo(
    () => async () => {
      try { await shareRecap(viewShotRef, year); } catch { /* user cancelled / unavailable */ }
    },
    [year]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        {isLoading && <ActivityIndicator size="large" color="#C41E3A" style={styles.center} />}
        {isError && <Text style={styles.message}>Could not load your recap. Pull back and try again.</Text>}

        {recap && recap.filmsSeen < THIN_YEAR_MIN_FILMS && (
          <Text style={styles.message}>
            Not enough logged for a {recap.year} recap yet — keep tracking and check back.
          </Text>
        )}

        {recap && recap.filmsSeen >= THIN_YEAR_MIN_FILMS && (
          <>
            <YearRecapPoster recap={recap} viewShotRef={viewShotRef} />

            <Pressable style={styles.shareBtn} onPress={onShare}>
              <Text style={styles.shareText}>↗ Share your year</Text>
            </Pressable>

            {recap.availableYears.length > 1 && (
              <View style={styles.archive}>
                {recap.availableYears.map((y) => (
                  <Pressable key={y} onPress={() => router.setParams({ year: String(y) })}
                    style={[styles.chip, y === year && styles.chipActive]}>
                    <Text style={[styles.chipText, y === year && styles.chipTextActive]}>{y}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  content: { padding: 20, alignItems: 'center', gap: 18 },
  back: { alignSelf: 'flex-start' },
  backText: { color: '#F5EBD9', fontSize: 16 },
  center: { marginTop: 60 },
  message: { color: '#F5EBD9', textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22, paddingHorizontal: 12 },
  shareBtn: { backgroundColor: '#C41E3A', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  shareText: { color: '#F5EBD9', fontWeight: '700', fontSize: 15 },
  archive: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: '#C41E3A', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  chipActive: { backgroundColor: '#C41E3A' },
  chipText: { color: '#C41E3A', fontWeight: '700' },
  chipTextActive: { color: '#F5EBD9' },
});
