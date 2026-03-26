import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Image } from 'expo-image';

import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { captureException } from '@/lib/sentry';
import { useAchievementCheck } from '@/lib/achievement-context';
import {
  parseLetterboxdCSV,
  matchMoviesToTMDB,
  importMovies,
  detectLetterboxdCSVType,
  type LetterboxdCSVType,
  type MatchedMovie,
  type ImportProgress,
} from '@/lib/letterboxd-service';
import { getTMDBImageUrl } from '@/lib/tmdb.types';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

type ImportState = 'idle' | 'parsing' | 'wrong-file' | 'matching' | 'review' | 'importing' | 'done';

type ThemeColors = typeof Colors.dark;

export default function LetterboxdImportScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const { triggerAchievementCheck } = useAchievementCheck();
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  const [state, setState] = useState<ImportState>('idle');
  const [detectedFileType, setDetectedFileType] = useState<LetterboxdCSVType | null>(null);
  const [matches, setMatches] = useState<MatchedMovie[]>([]);
  const [matchProgress, setMatchProgress] = useState<ImportProgress | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentMovieName, setCurrentMovieName] = useState<string>('');

  const matchedMovies = useMemo(
    () => matches.filter((m) => m.status === 'matched'),
    [matches]
  );
  const unmatchedMovies = useMemo(
    () => matches.filter((m) => m.status === 'unmatched'),
    [matches]
  );
  const duplicateMovies = useMemo(
    () => matches.filter((m) => m.status === 'duplicate'),
    [matches]
  );

  const handleSelectFile = useCallback(async () => {
    hapticImpact();
    setError(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/octet-stream'],
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const fileUri = result.assets[0].uri;

      // Parse CSV
      setState('parsing');
      const response = await fetch(fileUri);
      if (!response.ok) throw new Error(`Could not read file (${response.status})`);
      const csvContent = await response.text();

      const csvType = detectLetterboxdCSVType(csvContent);
      if (csvType === 'ratings' || csvType === 'watchlist' || csvType === 'unknown') {
        setDetectedFileType(csvType);
        setState('wrong-file');
        return;
      }

      const entries = parseLetterboxdCSV(csvContent);

      if (entries.length === 0) {
        setError('No valid entries found. Make sure you selected watched.csv or diary.csv from your Letterboxd export.');
        setState('idle');
        return;
      }

      // Match to TMDB
      setState('matching');
      const matched = await matchMoviesToTMDB(entries, (progress) => {
        setMatchProgress(progress);
        if (progress.current < entries.length) {
          setCurrentMovieName(entries[progress.current]?.name ?? '');
        }
      });

      setMatches(matched);
      setState('review');
    } catch (err) {
      console.error('[Letterboxd] Import error:', err);
      captureException(err instanceof Error ? err : new Error(String(err)), {
        context: 'letterboxd-import-select-file',
      });
      setError('Failed to read or parse the CSV file. Please try again.');
      setState('idle');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!user) {
      setError('You must be signed in to import movies.');
      return;
    }

    hapticImpact(ImpactFeedbackStyle.Medium);
    setState('importing');

    try {
      const finalProgress = await importMovies(user.id, matches, (progress) => {
        setImportProgress(progress);
      });

      setImportProgress(finalProgress);
      setState('done');
      triggerAchievementCheck();
      hapticNotification(NotificationFeedbackType.Success);
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        context: 'letterboxd-import-import-movies',
      });
      setError('An error occurred during import. Some movies may have been imported.');
      setState('review');
    }
  }, [user, matches, triggerAchievementCheck]);

  const handleDone = useCallback(() => {
    hapticImpact();
    router.back();
  }, []);

  const importableCount = matchedMovies.length;

  const renderProgressBar = (current: number, total: number) => {
    const progress = total > 0 ? current / total : 0;
    return (
      <View style={dynamicStyles.progressBarContainer}>
        <View style={[dynamicStyles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    );
  };

  const renderContent = () => {
    switch (state) {
      case 'idle':
        return (
          <View style={dynamicStyles.centeredContent}>
            <Text style={dynamicStyles.instructions}>
              Export your data from Letterboxd.com (Settings → Import &amp; Export → Export Your Data). You&apos;ll receive a .zip file — extract it on your device, then select watched.csv to import your full watch history.
            </Text>
            {error && (
              <Text style={dynamicStyles.errorText}>{error}</Text>
            )}
            <Pressable
              style={({ pressed }) => [
                dynamicStyles.primaryButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={handleSelectFile}
            >
              <Text style={dynamicStyles.primaryButtonText}>Select watched.csv</Text>
            </Pressable>
          </View>
        );

      case 'wrong-file': {
        const wrongFileMessage =
          detectedFileType === 'ratings'
            ? 'You selected ratings.csv. This file only contains ratings, not your full watch history.'
            : detectedFileType === 'watchlist'
            ? "You selected watchlist.csv. This contains films you want to watch, not ones you've seen."
            : "This doesn't look like a Letterboxd export file.";

        return (
          <View style={dynamicStyles.centeredContent}>
            <Text style={dynamicStyles.wrongFileTitle}>Wrong file selected</Text>
            <Text style={dynamicStyles.instructions}>{wrongFileMessage}</Text>
            <Text style={dynamicStyles.instructions}>
              Open your Letterboxd export folder and select{' '}
              <Text style={{ fontWeight: '700', color: colors.text }}>watched.csv</Text>
              {' '}to import your watch history.
            </Text>
            <Pressable
              style={({ pressed }) => [dynamicStyles.primaryButton, pressed && { opacity: 0.8 }]}
              onPress={() => { setState('idle'); setDetectedFileType(null); }}
            >
              <Text style={dynamicStyles.primaryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        );
      }

      case 'parsing':
        return (
          <View style={dynamicStyles.centeredContent}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={dynamicStyles.statusText}>Parsing CSV...</Text>
          </View>
        );

      case 'matching':
        return (
          <View style={dynamicStyles.centeredContent}>
            <Text style={dynamicStyles.statusText}>Matching movies...</Text>
            {matchProgress && (
              <>
                {renderProgressBar(matchProgress.current, matchProgress.total)}
                <Text style={dynamicStyles.progressText}>
                  {matchProgress.current} / {matchProgress.total}
                </Text>
                {currentMovieName ? (
                  <Text style={dynamicStyles.currentMovieText} numberOfLines={1}>
                    {currentMovieName}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        );

      case 'review':
        return (
          <>
            <View style={dynamicStyles.summaryContainer}>
              <View style={dynamicStyles.summaryRow}>
                <Text style={dynamicStyles.summaryLabel}>Matched</Text>
                <Text style={dynamicStyles.summaryValue}>{matchedMovies.length}</Text>
              </View>
              <View style={dynamicStyles.summaryRow}>
                <Text style={dynamicStyles.summaryLabel}>Unmatched</Text>
                <Text style={dynamicStyles.summaryValueWarning}>{unmatchedMovies.length}</Text>
              </View>
              <View style={dynamicStyles.summaryRow}>
                <Text style={dynamicStyles.summaryLabel}>Already in collection</Text>
                <Text style={dynamicStyles.summaryValue}>{duplicateMovies.length}</Text>
              </View>
            </View>

            {error && (
              <Text style={[dynamicStyles.errorText, { marginHorizontal: Spacing.md }]}>{error}</Text>
            )}

            <ScrollView style={dynamicStyles.movieList} contentContainerStyle={dynamicStyles.movieListContent}>
              {matchedMovies.length > 0 && (
                <View style={dynamicStyles.movieSection}>
                  <Text style={dynamicStyles.movieSectionTitle}>Matched Movies</Text>
                  {matchedMovies.map((match, index) => (
                    <View key={`matched-${index}`} style={dynamicStyles.movieRow}>
                      <Image
                        source={
                          match.tmdbMovie?.poster_path
                            ? { uri: getTMDBImageUrl(match.tmdbMovie.poster_path, 'w92') ?? undefined }
                            : undefined
                        }
                        style={dynamicStyles.moviePoster}
                        contentFit="cover"
                        transition={200}
                      />
                      <View style={dynamicStyles.movieInfo}>
                        <Text style={dynamicStyles.movieTitle} numberOfLines={1}>
                          {match.tmdbMovie?.title ?? match.entry.name}
                        </Text>
                        <Text style={dynamicStyles.movieYear}>
                          {match.tmdbMovie?.release_date?.split('-')[0] ?? match.entry.year ?? ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {unmatchedMovies.length > 0 && (
                <View style={dynamicStyles.movieSection}>
                  <Text style={dynamicStyles.movieSectionTitle}>Unmatched Movies</Text>
                  {unmatchedMovies.map((match, index) => (
                    <View key={`unmatched-${index}`} style={[dynamicStyles.movieRow, dynamicStyles.unmatchedRow]}>
                      <View style={dynamicStyles.moviePosterPlaceholder}>
                        <Text style={dynamicStyles.placeholderText}>?</Text>
                      </View>
                      <View style={dynamicStyles.movieInfo}>
                        <Text style={dynamicStyles.movieTitle} numberOfLines={1}>
                          {match.entry.name}
                        </Text>
                        <Text style={dynamicStyles.movieYear}>
                          {match.entry.year ?? 'Unknown year'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={dynamicStyles.bottomBar}>
              <Pressable
                style={({ pressed }) => [
                  dynamicStyles.primaryButton,
                  importableCount === 0 && { opacity: 0.5 },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleImport}
                disabled={importableCount === 0}
              >
                <Text style={dynamicStyles.primaryButtonText}>
                  Import {importableCount} Movie{importableCount !== 1 ? 's' : ''}
                </Text>
              </Pressable>
            </View>
          </>
        );

      case 'importing':
        return (
          <View style={dynamicStyles.centeredContent}>
            <Text style={dynamicStyles.statusText}>Importing movies...</Text>
            {importProgress && (
              <>
                {renderProgressBar(importProgress.current, importProgress.total)}
                <Text style={dynamicStyles.progressText}>
                  {importProgress.current} / {importProgress.total}
                </Text>
              </>
            )}
          </View>
        );

      case 'done':
        return (
          <View style={dynamicStyles.centeredContent}>
            <Text style={dynamicStyles.doneTitle}>Import Complete!</Text>
            {importProgress && (
              <View style={dynamicStyles.summaryContainer}>
                <View style={dynamicStyles.summaryRow}>
                  <Text style={dynamicStyles.summaryLabel}>Imported</Text>
                  <Text style={dynamicStyles.summaryValue}>{importProgress.imported}</Text>
                </View>
                <View style={dynamicStyles.summaryRow}>
                  <Text style={dynamicStyles.summaryLabel}>Already in collection</Text>
                  <Text style={dynamicStyles.summaryValue}>{importProgress.duplicates}</Text>
                </View>
                <View style={dynamicStyles.summaryRow}>
                  <Text style={dynamicStyles.summaryLabel}>Unmatched</Text>
                  <Text style={dynamicStyles.summaryValueWarning}>{importProgress.unmatched}</Text>
                </View>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [
                dynamicStyles.primaryButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={handleDone}
            >
              <Text style={dynamicStyles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text style={[Typography.display.h4, { color: colors.text }]}>Letterboxd Import</Text>
        <View style={{ width: 24 }} />
      </View>

      {renderContent()}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
    },
    centeredContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
    },
    instructions: {
      ...Typography.body.base,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.xl,
      lineHeight: 22,
    },
    errorText: {
      ...Typography.body.sm,
      color: '#ff4444',
      textAlign: 'center',
      marginBottom: Spacing.md,
    },
    primaryButton: {
      backgroundColor: colors.tint,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      width: '100%',
      ...(Platform.OS === 'web' ? { maxWidth: 400, alignSelf: 'center' as const } : {}),
    },
    primaryButtonText: {
      ...Typography.button.primary,
      color: '#ffffff',
    },
    statusText: {
      ...Typography.body.lg,
      color: colors.text,
      marginBottom: Spacing.md,
    },
    progressBarContainer: {
      width: '100%',
      height: 6,
      backgroundColor: colors.card,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: Spacing.sm,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.tint,
      borderRadius: 3,
    },
    progressText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    currentMovieText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
      fontStyle: 'italic',
    },
    summaryContainer: {
      width: '100%',
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    summaryLabel: {
      ...Typography.body.base,
      color: colors.text,
    },
    summaryValue: {
      ...Typography.body.base,
      color: colors.accentSecondary,
      fontWeight: '600',
    },
    summaryValueWarning: {
      ...Typography.body.base,
      color: '#ff4444',
      fontWeight: '600',
    },
    movieList: {
      flex: 1,
    },
    movieListContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: 100,
    },
    movieSection: {
      marginBottom: Spacing.lg,
    },
    movieSectionTitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Spacing.sm,
      paddingLeft: Spacing.sm,
    },
    movieRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.sm,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: Spacing.sm,
    },
    unmatchedRow: {
      backgroundColor: 'rgba(255, 68, 68, 0.05)',
    },
    moviePoster: {
      width: 40,
      height: 60,
      borderRadius: 4,
      backgroundColor: colors.backgroundSecondary,
    },
    moviePosterPlaceholder: {
      width: 40,
      height: 60,
      borderRadius: 4,
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      ...Typography.body.lg,
      color: colors.textTertiary,
    },
    movieInfo: {
      flex: 1,
    },
    movieTitle: {
      ...Typography.body.base,
      color: colors.text,
      fontWeight: '500',
    },
    movieYear: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    bottomBar: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    doneTitle: {
      ...Typography.display.h3,
      color: colors.accentSecondary,
      marginBottom: Spacing.lg,
    },
    wrongFileTitle: {
      ...Typography.display.h3,
      color: colors.text,
      marginBottom: Spacing.md,
    },
  });
