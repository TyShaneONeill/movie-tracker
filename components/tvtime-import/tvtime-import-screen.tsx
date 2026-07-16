import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
import { captureException } from '@/lib/sentry';
import { analytics } from '@/lib/analytics';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ContentContainer } from '@/components/content-container';
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
  saveNeedsReview,
  resolveNeedsReviewItem,
  reviewItemId,
  emptyImportCounts,
  type ImportPreview,
  type ImportCounts,
  type ImportProgress,
  type PersistedReviewItem,
} from '@/lib/tvtime-import';
import type { TvTimeMatchResult } from '@/lib/tvtime-import/types';
import { TicketIcon, ChevronLeftIcon, WarningIcon } from './icons';
import { TvTimeFixMatchSheet } from './tvtime-fix-match-sheet';

const AMBER = '#f59e0b';

type Phase = 'pick' | 'reading' | 'preview' | 'importing' | 'done';

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
  const [progress, setProgress] = useState<ImportProgress>({ processed: 0, total: 0 });
  const [reviewItems, setReviewItems] = useState<PersistedReviewItem[]>([]);
  const [fixItem, setFixItem] = useState<PersistedReviewItem | null>(null);

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

      const pickedUri = result.assets[0].uri;
      setPhase('reading');
      try {
        const files = await unzipTvTimeExport(pickedUri);
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
        // Delete the picker's cache copy of the ZIP — it holds the export's
        // auth-token / password-hash CSVs and must not linger at rest.
        FileSystem.deleteAsync(pickedUri, { idempotent: true }).catch(() => {});
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
    if (!match) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    setPhase('importing');
    setProgress({ processed: 0, total: 0 });
    const startedAt = Date.now();

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Your session expired. Sign in and try again.');

      const items = mapMatchToImportItems(match);
      analytics.track('import_started', {
        entry_point: entryPoint,
        shows: items.shows.length,
        episodes: items.shows.reduce((s, sh) => s + sh.episodes.length, 0),
        movies: items.movies.length,
      });

      const result = await runTvTimeImport({
        shows: items.shows,
        movies: items.movies,
        importKey: importKeyRef.current,
        accessToken,
        onProgress: (p) => mountedRef.current && setProgress(p),
      });

      // Persist unresolved "Needs a look" items so they're resumable.
      await saveNeedsReview(user.id, reviewItems);
      invalidateUserMovieQueries(queryClient);

      analytics.track('import_completed', {
        entry_point: entryPoint,
        shows_upserted: result.showsUpserted,
        episodes_inserted: result.episodesInserted,
        episodes_skipped: result.episodesSkipped,
        episodes_invalid: result.episodesInvalid,
        movies_inserted: result.moviesInserted,
        movies_updated: result.moviesUpdated,
        movies_skipped: result.moviesSkipped,
        movies_invalid: result.moviesInvalid,
        needs_review: reviewItems.length,
        duration_ms: Date.now() - startedAt,
      });

      if (!mountedRef.current) return;
      setCounts(result);
      setPhase('done');
      hapticNotification(NotificationFeedbackType.Success);
    } catch (err) {
      // Report AND persist BEFORE the mounted check: a backgrounded import that
      // fails must still be captured and its review state recoverable from
      // Settings -> Import — "we'll finish in the background" has to be true.
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'tvtime-import-run' });
      if (user) await saveNeedsReview(user.id, reviewItems);
      if (!mountedRef.current) return;
      setError('Something interrupted the import. Nothing was duplicated — you can try again.');
      setPhase('preview');
    }
  }, [user, match, reviewItems, queryClient, entryPoint]);

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
              },
            ],
            importKey: importKeyRef.current,
            accessToken,
          });
          invalidateUserMovieQueries(queryClient);
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

        {phase === 'pick' && <PickScreen styles={styles} colors={colors} error={error} onPick={handleSelectFile} />}
        {phase === 'reading' && <ReadingScreen styles={styles} colors={colors} />}
        {phase === 'preview' && preview && (
          <PreviewScreen styles={styles} colors={colors} preview={preview} error={error} onImport={handleImport} onCancel={() => router.back()} />
        )}
        {phase === 'importing' && <ImportingScreen styles={styles} colors={colors} progress={progress} onHide={() => router.back()} />}
        {phase === 'done' && (
          <DoneScreen
            styles={styles}
            colors={colors}
            counts={counts}
            preview={preview}
            reviewItems={reviewItems}
            resume={params.resume === '1'}
            onFix={setFixItem}
            onPickCandidate={resolveWith}
            onDismissItem={dismissItem}
            onDone={() => router.back()}
          />
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
        <Pressable onPress={onDone} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tint }, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </Pressable>
      </View>
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
    pickBody: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
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
    scrollBody: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xl },
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
    footer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm },
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
