import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateTvTimeImportQueries } from '@/lib/query-invalidation';
import { invalidateHasTvTimeImport } from '@/hooks/use-has-tvtime-import';
import { captureException } from '@/lib/sentry';
import { analytics } from '@/lib/analytics';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ContentContainer, formWidthStyle } from '@/components/content-container';
import type { TMDBMovie } from '@/lib/tmdb.types';
import {
  unzipTvTimeExport,
  parseTvTimeExport,
  matchTvTimePayload,
  createDefaultTmdbGateway,
  mapMatchToImportItems,
  runTvTimeImport,
  buildImportPreview,
  buildReviewItems,
  loadNeedsReview,
  resolveNeedsReviewItem,
  reviewItemId,
  emptyImportCounts,
  type ImportPreview,
  type ImportCounts,
  type ImportProgress,
  type PersistedReviewItem,
} from '@/lib/tvtime-import';
import type { TvTimeMatchResult } from '@/lib/tvtime-import/types';
import { useImportRun } from '@/lib/tvtime-import/import-run-context';
import { importScreenView } from '@/lib/tvtime-import/import-run-view';
import { TicketIcon, ChevronLeftIcon, WarningIcon } from './icons';
import { InkStubsCta } from '@/components/tvtime-deck/ink-stubs-cta';
import { TvTimeFixMatchSheet } from './tvtime-fix-match-sheet';
import { ReviewPromptSheet } from '@/components/review-prompt-sheet';
import {
  checkImportDoneReviewPrompt,
  markReviewPromptShown,
  acceptReviewPrompt,
  declineReviewPrompt,
} from '@/lib/review-prompt-service';

// Delay before the post-import review sheet appears on a fresh done screen —
// lets the success moment (stub count, haptic) land first.
const REVIEW_PROMPT_DELAY_MS = 2000;

const AMBER = '#f59e0b';

// Local screen phases only — 'importing'/done-after-run come from the provider
// (see importScreenView), so they're not part of the local phase.
type Phase = 'pick' | 'reading' | 'preview' | 'done';

// Entry surfaces we measure conversion from. `?from=` values outside this set
// (or a raw deep link with no param) fall back to 'deeplink'.
const ENTRY_POINTS = new Set(['onboarding_completion', 'home_card', 'settings', 'deeplink']);

function newImportKey(): string {
  return `tvtime-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TvTimeImportScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ resume?: string; from?: string }>();
  // Which surface opened the import, for conversion analytics. Unknown/absent
  // (e.g. a raw deep link) is bucketed as 'deeplink'. Counts-only, no PII.
  const entryPoint = ENTRY_POINTS.has(params.from ?? '') ? (params.from as string) : 'deeplink';

  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<TvTimeMatchResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [counts, setCounts] = useState<ImportCounts>(emptyImportCounts());
  const [reviewItems, setReviewItems] = useState<PersistedReviewItem[]>([]);
  const [fixItem, setFixItem] = useState<PersistedReviewItem | null>(null);

  // The import RUN lives in a provider so it survives "Hide" + navigation; the
  // screen re-attaches by reading it. `start`/`reset`/`setScreenFocused` are
  // stable refs (safe as effect deps).
  const importRun = useImportRun();
  const { start: startImport, reset: resetImportRun, setScreenFocused } = importRun;

  const importKeyRef = useRef<string>(newImportKey());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Resume mode: open straight to the saved "Needs a look" list (Settings -> Import).
  useEffect(() => {
    if (params.resume !== '1' || !user) return;
    let cancelled = false;
    loadNeedsReview(user.id).then((items) => {
      if (cancelled) return;
      setReviewItems(items);
      setPhase('done');
    });
    return () => {
      cancelled = true;
    };
  }, [params.resume, user]);

  // Tell the provider whether this screen is focused — the global pill shows
  // only while an import is running AND the screen is NOT focused.
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [setScreenFocused])
  );

  // Re-attach to a finished run: pull its counts/preview/review list into local
  // state so the done screen (and fix-a-match) render whether the import just
  // completed here or finished in the background while we were away. Also restore
  // preview/reviewItems on an ERROR that finished in the background — otherwise a
  // returning user hits the error branch with null local preview and sees a blank
  // screen with no way forward.
  useEffect(() => {
    if (importRun.phase === 'complete') {
      if (importRun.counts) setCounts(importRun.counts);
      if (importRun.preview) setPreview(importRun.preview);
      setReviewItems(importRun.reviewItems);
    } else if (importRun.phase === 'error') {
      if (importRun.preview) setPreview(importRun.preview);
      setReviewItems(importRun.reviewItems);
    }
  }, [importRun.phase, importRun.counts, importRun.preview, importRun.reviewItems]);

  // -------------------------------------------------------------------------
  // Pick + parse + match
  // -------------------------------------------------------------------------
  const handleSelectFile = useCallback(async () => {
    hapticImpact();
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const pickedAsset = result.assets[0];
      const pickedUri = pickedAsset.uri;
      setPhase('reading');
      try {
        // On web the picker hands back an in-memory File (blob: URI) that
        // expo-file-system can't read — pass it through so the read path can
        // use Blob.arrayBuffer() instead. `file` is undefined on native.
        const files = await unzipTvTimeExport(pickedUri, pickedAsset.file);
        const parsed = parseTvTimeExport(files);
        const matched = await matchTvTimePayload(parsed, createDefaultTmdbGateway());
        if (!mountedRef.current) return;

        setMatch(matched);
        const pv = buildImportPreview(matched);
        setPreview(pv);
        setReviewItems(buildReviewItems(matched));
        setPhase('preview');
        // Counts only — never titles or row content (PII hygiene).
        analytics.track('import_preview', {
          shows: pv.shows,
          episodes: pv.episodes,
          movies_watched: pv.moviesWatched,
          movies_watchlist: pv.moviesWatchlist,
          needs_attention: pv.needsAttention,
        });
      } finally {
        // Native only: delete the picker's cache copy of the ZIP — it holds the
        // export's auth-token / password-hash CSVs and must not linger at rest.
        // On web there's no cache copy (the File lives in memory and is GC'd) and
        // expo-file-system can't touch a blob: URI, so skip it.
        if (Platform.OS !== 'web') {
          FileSystem.deleteAsync(pickedUri, { idempotent: true }).catch(() => {});
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // A parse/read error message is user-facing copy, safe to show. It is NOT
      // sent to Sentry verbatim (it may echo file structure) — counts only.
      const message = err instanceof Error ? err.message : 'Something went wrong reading your export.';
      setError(message);
      setPhase('pick');
      captureException(new Error('tvtime-import-read-failed'), { context: 'tvtime-import-select-file' });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------
  const handleImport = useCallback(async () => {
    if (!user) {
      setError('You must be signed in to import.');
      return;
    }
    if (!match || !preview) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError('Your session expired. Sign in and try again.');
        return;
      }
      const items = mapMatchToImportItems(match);
      // Hand the run to the provider: it keeps running (and firing completion
      // side-effects: invalidation, marker, analytics, haptic, notification)
      // even if the user taps "Hide" and leaves. The screen just observes.
      startImport({
        userId: user.id,
        accessToken,
        shows: items.shows,
        movies: items.movies,
        importKey: importKeyRef.current,
        preview,
        reviewItems,
        entryPoint,
      });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'tvtime-import-start' });
      setError('Something went wrong starting the import. Please try again.');
    }
  }, [user, match, preview, reviewItems, entryPoint, startImport]);

  // Backgrounded-error recovery: when the run failed while the user was away, the
  // matched payload is gone (we deliberately don't retain the shows/movies in the
  // provider — it's memory-heavy), so a direct retry isn't possible. Reset the
  // run + local state and return to the pick step. Re-importing the same ZIP is
  // safe: the server is idempotent, so nothing is ever duplicated.
  const handleStartOver = useCallback(() => {
    resetImportRun();
    setMatch(null);
    setPreview(null);
    setReviewItems([]);
    setError(null);
    setPhase('pick');
  }, [resetImportRun]);

  // -------------------------------------------------------------------------
  // Fix-a-match resolution
  // -------------------------------------------------------------------------
  const resolveWith = useCallback(
    async (item: PersistedReviewItem, movie: TMDBMovie) => {
      if (!user) return;
      const id = reviewItemId(item);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          await runTvTimeImport({
            shows: [],
            movies: [
              {
                tmdbId: movie.id,
                title: movie.title,
                status: item.status,
                watchedAt: item.watchedAt,
                rewatchCount: item.rewatchCount,
                // Carry the picked movie's metadata so the re-linked stub
                // renders a poster + feeds stats like any other.
                posterPath: movie.poster_path ?? null,
                backdropPath: movie.backdrop_path ?? null,
                genreIds: movie.genre_ids ?? [],
                voteAverage: movie.vote_average ?? null,
                releaseDate: movie.release_date ?? item.releaseDate ?? null,
              },
            ],
            importKey: importKeyRef.current,
            accessToken,
          });
          invalidateTvTimeImportQueries(queryClient);
          invalidateHasTvTimeImport(queryClient);
        }
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), { context: 'tvtime-import-resolve' });
      }
      const remaining = await resolveNeedsReviewItem(user.id, id);
      if (!mountedRef.current) return;
      setReviewItems(remaining);
      setFixItem(null);
      hapticNotification(NotificationFeedbackType.Success);
    },
    [user, queryClient]
  );

  const dismissItem = useCallback(
    async (item: PersistedReviewItem) => {
      if (!user) return;
      const remaining = await resolveNeedsReviewItem(user.id, reviewItemId(item));
      if (!mountedRef.current) return;
      setReviewItems(remaining);
    },
    [user]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  // Provider phase wins over the local phase (re-attach); see importScreenView.
  const view = importScreenView(importRun.phase, phase);
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ContentContainer style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Import from TV Time</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Running / complete / error come from the provider (survive Hide +
            navigation); pick / reading / preview / resume-done are local. The
            provider phase wins, which is what re-attaches a returning user to
            the live import instead of the pick screen. */}
        {view === 'importing' && <ImportingScreen styles={styles} colors={colors} progress={importRun.progress} onHide={() => router.back()} />}
        {view === 'error' && (() => {
          const errPreview = importRun.preview ?? preview;
          // Live in-screen error: the matched payload is still in local state, so
          // the direct "Import everything" retry works. Backgrounded error (the
          // user left and came back to a fresh mount): `match` is gone, so a direct
          // retry is impossible — offer an honest "Start over" instead of a dead button.
          if (match && errPreview) {
            return (
              <PreviewScreen
                styles={styles}
                colors={colors}
                preview={errPreview}
                error={importRun.error}
                onImport={handleImport}
                onCancel={() => { resetImportRun(); router.back(); }}
              />
            );
          }
          return (
            <ImportErrorScreen
              styles={styles}
              colors={colors}
              error={importRun.error}
              onStartOver={handleStartOver}
              onCancel={() => { resetImportRun(); router.back(); }}
            />
          );
        })()}
        {view === 'done' && (
          <DoneScreen
            styles={styles}
            colors={colors}
            counts={counts}
            preview={preview}
            reviewItems={reviewItems}
            resume={importRun.phase !== 'complete' && params.resume === '1'}
            onFix={setFixItem}
            onPickCandidate={resolveWith}
            onDismissItem={dismissItem}
            onDone={() => { resetImportRun(); router.back(); }}
          />
        )}
        {view === 'pick' && <PickScreen styles={styles} colors={colors} error={error} onPick={handleSelectFile} />}
        {view === 'reading' && <ReadingScreen styles={styles} colors={colors} />}
        {view === 'preview' && preview && (
          <PreviewScreen styles={styles} colors={colors} preview={preview} error={error} onImport={handleImport} onCancel={() => router.back()} />
        )}
      </ContentContainer>

      <TvTimeFixMatchSheet
        visible={fixItem !== null}
        item={fixItem}
        onSelect={(movie) => fixItem && resolveWith(fixItem, movie)}
        onNoneOfThese={() => setFixItem(null)}
        onClose={() => setFixItem(null)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-screens (frames)
// ---------------------------------------------------------------------------

type Styles = ReturnType<typeof createStyles>;
type ThemeColors = typeof Colors.dark;

function PickScreen({ styles, colors, error, onPick }: { styles: Styles; colors: ThemeColors; error: string | null; onPick: () => void }) {
  return (
    <View style={styles.pickBody}>
      <Text style={[Typography.display.h3, { color: colors.text }]}>Bring your history home.</Text>
      <Text style={[Typography.body.base, styles.pickSub, { color: colors.textSecondary }]}>
        Choose the ZIP you exported from TV Time — usually{' '}
        <Text style={{ color: colors.text, fontWeight: '700' }}>gdpr-data.zip</Text> (or a similar name). We read it on your
        device; nothing is imported until you confirm.
      </Text>

      <View style={[styles.dropzone, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TicketIcon color={colors.tint} size={40} />
        <Text style={[Typography.body.base, { color: colors.text, fontWeight: '700', marginTop: Spacing.sm }]}>gdpr-data.zip</Text>
        <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>usually in Downloads or Files</Text>
      </View>

      <Text style={[Typography.body.sm, styles.quiet, { color: colors.textTertiary }]}>
        TV Time closed July 15, 2026 — but your export file works forever.
      </Text>

      {error && <Text style={[Typography.body.sm, styles.errorText]}>{error}</Text>}

      <Pressable onPress={onPick} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tint }, pressed && { opacity: 0.85 }]}>
        <Text style={styles.primaryBtnText}>Choose export file</Text>
      </Pressable>
    </View>
  );
}

function ReadingScreen({ styles, colors }: { styles: Styles; colors: ThemeColors }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.tint} />
      <Text style={[Typography.body.lg, { color: colors.text, marginTop: Spacing.md }]}>Reading your export…</Text>
      <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: Spacing.xs }]}>Matching your shows and movies</Text>
    </View>
  );
}

function XlateRow({ styles, colors, n, what, to, quiet }: { styles: Styles; colors: ThemeColors; n: number; what: string; to: string; quiet?: string }) {
  return (
    <View style={[styles.xlate, { backgroundColor: colors.card }]}>
      <View style={styles.xlateFrom}>
        <Text style={[styles.xlateN, { color: colors.text }]}>{n}</Text>
        <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>{what}</Text>
      </View>
      <Text style={[Typography.body.sm, styles.xlateTo, { color: colors.tint }]}>
        {to}
        {quiet ? <Text style={{ color: colors.textTertiary, fontWeight: '400' }}> {quiet}</Text> : null}
      </Text>
    </View>
  );
}

function PreviewScreen({
  styles,
  colors,
  preview,
  error,
  onImport,
  onCancel,
}: {
  styles: Styles;
  colors: ThemeColors;
  preview: ImportPreview;
  error: string | null;
  onImport: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={[Typography.display.h3, { color: colors.text }]}>Here&apos;s what happens</Text>
        <Text style={[Typography.body.base, { color: colors.textSecondary, marginTop: 4, marginBottom: Spacing.md }]}>
          From your TV Time export → into your PocketStubs:
        </Text>

        {preview.episodes > 0 && (
          <XlateRow styles={styles} colors={colors} n={preview.episodes} what="episodes watched" to="→ logged to your watch history" quiet="· counts toward your stats" />
        )}
        {preview.shows > 0 && (
          <XlateRow styles={styles} colors={colors} n={preview.shows} what="shows you follow" to="→ join your Watching list" quiet="· new episodes tracked" />
        )}
        {preview.moviesWatched > 0 && (
          <XlateRow styles={styles} colors={colors} n={preview.moviesWatched} what="movies watched" to="→ stubs printed in your collection" />
        )}
        {preview.moviesWatchlist > 0 && (
          <XlateRow styles={styles} colors={colors} n={preview.moviesWatchlist} what="movies to watch" to="→ added to your Pile" quiet="· your watchlist" />
        )}

        {preview.needsAttention > 0 && (
          <View style={[styles.warnBanner, { borderColor: AMBER }]}>
            <WarningIcon color={AMBER} size={16} />
            <Text style={[Typography.body.sm, { color: AMBER, flex: 1 }]}>
              {preview.needsAttention} {preview.needsAttention === 1 ? 'row' : 'rows'} couldn&apos;t be read — listed after import so
              nothing disappears silently.
            </Text>
          </View>
        )}

        {error && <Text style={[Typography.body.sm, styles.errorText]}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onImport} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tint }, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryBtnText}>Import everything</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ImportErrorScreen({
  styles,
  colors,
  error,
  onStartOver,
  onCancel,
}: {
  styles: Styles;
  colors: ThemeColors;
  error: string | null;
  onStartOver: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.scrollBody}>
        <View style={styles.doneTitleRow}>
          <WarningIcon color={AMBER} size={22} />
          <Text style={[Typography.display.h3, { color: colors.text }]}>Import interrupted</Text>
        </View>
        <Text style={[Typography.body.base, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
          {error ?? 'Something interrupted the import before it finished.'}
        </Text>
        <Text style={[Typography.body.sm, { color: colors.textTertiary, marginTop: Spacing.md, lineHeight: 20 }]}>
          Pick your export again to pick up where it left off. Re-running never duplicates anything —
          already-imported stubs are skipped.
        </Text>
      </View>
      <View style={styles.footer}>
        <Pressable onPress={onStartOver} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tint }, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryBtnText}>Start over</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ImportingScreen({ styles, colors, progress, onHide }: { styles: Styles; colors: ThemeColors; progress: ImportProgress; onHide: () => void }) {
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.scrollBody}>
        <Text style={[Typography.display.h3, { color: colors.text }]}>Printing your stubs…</Text>
        <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
          <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${pct}%` }]} />
          </View>
          <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
            {progress.processed} / {progress.total || '…'}
          </Text>
        </View>
        <Text style={[Typography.body.sm, styles.quiet, { color: colors.textTertiary }]}>
          Safe to leave this screen — we&apos;ll finish in the background.{'\n'}Interrupted? Re-running never duplicates anything.
        </Text>
      </View>
      <View style={styles.footer}>
        <Pressable onPress={onHide} style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Hide</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DoneScreen({
  styles,
  colors,
  counts,
  preview,
  reviewItems,
  resume,
  onFix,
  onPickCandidate,
  onDismissItem,
  onDone,
}: {
  styles: Styles;
  colors: ThemeColors;
  counts: ImportCounts;
  preview: ImportPreview | null;
  reviewItems: PersistedReviewItem[];
  resume: boolean;
  onFix: (item: PersistedReviewItem) => void;
  onPickCandidate: (item: PersistedReviewItem, movie: TMDBMovie) => void;
  onDismissItem: (item: PersistedReviewItem) => void;
  onDone: () => void;
}) {
  const stubs = counts.episodesInserted + counts.moviesInserted + counts.moviesUpdated;
  const invalid = counts.episodesInvalid + counts.moviesInvalid;
  const watched = preview?.moviesWatched ?? 0;
  const watchlist = preview?.moviesWatchlist ?? 0;

  // Post-import review ask — fresh completion only (never on a resume visit),
  // once per user ever, and only when something actually got imported. See
  // lib/review-prompt-service.ts for the once-ever gate. The shown-flag is
  // burned only once the sheet actually becomes visible (`cancelled` guards
  // the async gap between the timer firing and the check resolving) — a user
  // who taps Done and unmounts mid-check must not permanently lose the
  // prompt without ever seeing it.
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const reviewCheckStartedRef = useRef(false);
  useEffect(() => {
    if (resume || reviewCheckStartedRef.current) return;
    reviewCheckStartedRef.current = true;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkImportDoneReviewPrompt(stubs)
        .then(({ show }) => {
          if (!show || cancelled) return;
          setShowReviewPrompt(true);
          markReviewPromptShown().catch(() => {});
        })
        .catch(() => {});
    }, REVIEW_PROMPT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resume, stubs]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        {!resume && (
          <>
            <View style={styles.doneTitleRow}>
              <Text style={[Typography.display.h3, { color: colors.text }]}>{stubs} stubs printed</Text>
              <TicketIcon color={colors.tint} size={22} />
            </View>
            <Text style={[Typography.body.base, { color: colors.textSecondary, marginTop: 4 }]}>
              {counts.showsUpserted} shows · {counts.episodesInserted} episodes · {watched} movies · {watchlist} in the Pile
            </Text>
            {invalid > 0 && (
              <Text style={[Typography.body.sm, { color: colors.textTertiary, marginTop: Spacing.sm }]}>
                {invalid} {invalid === 1 ? 'row' : 'rows'} couldn&apos;t be imported.
              </Text>
            )}
          </>
        )}
        {resume && (
          <Text style={[Typography.display.h3, { color: colors.text }]}>Needs a look</Text>
        )}

        {reviewItems.length > 0 && (
          <>
            <Text style={[Typography.body.sm, styles.sectionHead, { color: colors.textSecondary }]}>
              NEEDS A LOOK ({reviewItems.length})
            </Text>
            {reviewItems.map((item) => (
              <ReviewCard
                key={reviewItemId(item)}
                styles={styles}
                colors={colors}
                item={item}
                onFix={() => onFix(item)}
                onPickCandidate={(movie) => onPickCandidate(item, movie)}
                onDismiss={() => onDismissItem(item)}
              />
            ))}
            <Text style={[Typography.body.sm, styles.quiet, { color: colors.textTertiary }]}>
              Fix these now or later from Settings — nothing is lost.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {/* Blank-stubs rating deck CTA (PR 4). Self-hides when the deck flag is
            off or nothing imported is unrated; when present it's the primary
            action and Done demotes to a ghost button (mock frame 5). */}
        <InkStubsCta />
        <Pressable
          onPress={onDone}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Done</Text>
        </Pressable>
      </View>

      <ReviewPromptSheet
        visible={showReviewPrompt}
        onAccept={() => {
          setShowReviewPrompt(false);
          acceptReviewPrompt();
        }}
        onDecline={() => {
          setShowReviewPrompt(false);
          declineReviewPrompt();
        }}
      />
    </View>
  );
}

function ReviewCard({
  styles,
  colors,
  item,
  onFix,
  onPickCandidate,
  onDismiss,
}: {
  styles: Styles;
  colors: ThemeColors;
  item: PersistedReviewItem;
  onFix: () => void;
  onPickCandidate: (movie: TMDBMovie) => void;
  onDismiss: () => void;
}) {
  const year = item.releaseDate ? item.releaseDate.slice(0, 4) : null;
  return (
    <View style={[styles.reviewCard, { backgroundColor: colors.card }]}>
      <Text style={[Typography.body.base, { color: colors.text, fontWeight: '700' }]}>
        {item.title}
        {year ? <Text style={{ color: colors.textTertiary, fontWeight: '400' }}> ({year})</Text> : null}
      </Text>
      <View style={styles.candRow}>
        {item.candidates.slice(0, 2).map((cand, i) => (
          <Pressable
            key={cand.id}
            onPress={() => onPickCandidate(cand)}
            style={({ pressed }) => [styles.cand, { borderColor: i === 0 ? colors.tint : colors.border }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[Typography.body.sm, { color: i === 0 ? colors.tint : colors.textSecondary, fontWeight: i === 0 ? '700' : '400' }]} numberOfLines={1}>
              {cand.title}
              {cand.release_date ? ` · ${cand.release_date.slice(0, 4)}` : ''}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={onFix} style={({ pressed }) => [styles.cand, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
          <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Search…</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} style={({ pressed }) => [styles.candDismiss, pressed && { opacity: 0.6 }]}>
          <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
    },
    pickBody: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, ...formWidthStyle },
    pickSub: { marginTop: Spacing.sm, lineHeight: 22 },
    dropzone: {
      marginTop: Spacing.xl,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.md,
    },
    quiet: { textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
    scrollBody: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xl, ...formWidthStyle },
    xlate: { borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.sm },
    xlateFrom: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    xlateN: { fontSize: 22, fontWeight: '800' },
    xlateTo: { marginTop: 5, fontWeight: '700' },
    warnBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
    },
    errorText: { color: '#ef4444', marginTop: Spacing.md },
    footer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm, ...formWidthStyle },
    primaryBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center' },
    primaryBtnText: { ...Typography.button.primary, color: '#ffffff' },
    secondaryBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', borderWidth: 1.5 },
    secondaryBtnText: { ...Typography.body.base, fontWeight: '700' },
    progressCard: { marginTop: Spacing.lg, borderRadius: BorderRadius.md, padding: Spacing.md },
    progressTrack: { height: 8, borderRadius: BorderRadius.full, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: BorderRadius.full },
    doneTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    sectionHead: { fontWeight: '800', letterSpacing: 1.5, marginTop: Spacing.lg, marginBottom: Spacing.xs },
    reviewCard: { borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.sm },
    candRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
    cand: { paddingVertical: 6, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, maxWidth: 200 },
    candDismiss: { paddingVertical: 6, paddingHorizontal: Spacing.sm },
  });
}
