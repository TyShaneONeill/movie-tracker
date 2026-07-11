/**
 * Search v2 screen — unified query, scope chips, "no wrong door" rescue state
 * (Proposal 01.2). Rendered in place of the legacy search screen when the
 * `search_v2` flag is on (see app/search.tsx).
 *
 * PR1 scope: the functional heart. The Movies/TV toggle is gone — one query
 * fans out over the existing edge functions (search-movies for titles,
 * search-movies actor-mode for people, search-tv-shows for TV) and merges into
 * one list, scoped after the fact by chips with live counts. App-user (profile)
 * search stays a separate query under the Users scope.
 *
 * Deferred to PR2: the browse rack (genre stubs, company shelves, trending),
 * the Lists chip, loading skeletons beyond the reused one, keyboard-open layout.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useNetwork } from '@/lib/network-context';
import { analytics } from '@/lib/analytics';
import { ContentContainer } from '@/components/content-container';
import { SearchSkeletonList } from '@/components/search-skeleton';
import { UserSearchResult } from '@/components/social/UserSearchResult';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useTvShowSearch } from '@/hooks/use-tv-show-search';
import { useUserSearch } from '@/hooks/use-user-search';
import { useBlockedUsers } from '@/hooks/use-blocked-users';
import { useRecentSearches, type RecentSearch } from '@/hooks/use-recent-searches';
import { useDiscoverMovies } from '@/hooks/use-discover-movies';

import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBMovie, TMDBTvShow, TMDBActor } from '@/lib/tmdb.types';
import {
  buildUnifiedResults,
  countsFor,
  filterByScope,
  selectRescueTarget,
  rescueCopy,
  formatLedgerDate,
  movieToResult,
  type SearchScope,
  type UnifiedResult,
} from '@/lib/search-v2-logic';
import { BROWSE_GENRES, COMPANY_SHELVES, genreSerial } from '@/lib/search-v2-shelves';
import { ScopeChips } from './scope-chips';
import { ResultRow } from './result-row';
import { TearLine } from './tear-line';
import { GenreStub } from './genre-stub';

const MAX_APP_WIDTH = 768;
const GRID_GAP = 10;

const BackIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

const SearchIconSvg = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="M21 21l-4.3-4.3" />
  </Svg>
);

const XIcon = ({ color }: { color: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
    <Line x1={18} y1={6} x2={6} y2={18} />
    <Line x1={6} y1={6} x2={18} y2={18} />
  </Svg>
);

export function SearchV2Screen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { isOffline } = useNetwork();
  const { width: windowWidth } = useWindowDimensions();

  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  // Browse mode: a genre stub was pulled from the rack (idle state only).
  const [browseGenre, setBrowseGenre] = useState<{ id: number; name: string } | null>(null);
  // A curated studio shelf was tapped — surfaces a coming-soon note (see below).
  const [comingSoonShelf, setComingSoonShelf] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const trimmed = debouncedQuery.trim();
  const showResults = trimmed.length >= 2;
  const browseActive = browseGenre !== null && !showResults;

  const { recentSearches, addRecentSearch } = useRecentSearches();

  // Genre browse fans out through the existing discover-movies edge fn; results
  // render as unified movie rows (Movies scope implied — no chips in browse).
  const {
    movies: browseMovies,
    isLoading: browseLoading,
    hasNextPage: browseHasNext,
    isFetchingNextPage: browseFetchingNext,
    fetchNextPage: fetchNextBrowsePage,
  } = useDiscoverMovies({ genreId: browseGenre?.id ?? null, enabled: browseActive });
  const browseResults = useMemo(() => browseMovies.map(movieToResult), [browseMovies]);

  // 2-column grid tile width, matching the results padding (Spacing.md each side).
  const tileWidth = useMemo(() => {
    const containerWidth = Math.min(windowWidth, MAX_APP_WIDTH) - Spacing.md * 2;
    return (containerWidth - GRID_GAP) / 2;
  }, [windowWidth]);

  // Unified fan-out: titles + TV + people (actor-mode) run in parallel. People
  // is secondary — we don't block the results on it.
  const { movies, isLoading: moviesLoading } = useMovieSearch({
    query: debouncedQuery,
    searchType: 'title',
    enabled: showResults,
  });
  const { shows, isLoading: tvLoading } = useTvShowSearch({
    query: debouncedQuery,
    enabled: showResults,
  });
  const { movies: actorMovies, actor } = useMovieSearch({
    query: debouncedQuery,
    searchType: 'actor',
    enabled: showResults,
  });

  // App-user search only runs under the Users scope.
  const { users: rawUsers, isLoading: usersLoading } = useUserSearch(
    scope === 'user' ? debouncedQuery : ''
  );
  const { blockedIds } = useBlockedUsers();
  const users = useMemo(
    () => rawUsers.filter((u) => !blockedIds.includes(u.id)),
    [rawUsers, blockedIds]
  );

  const person: TMDBActor | null = actor ?? null;
  const results = useMemo(
    () => buildUnifiedResults(movies, shows, person, actorMovies.map((m) => m.title)),
    [movies, shows, person, actorMovies]
  );
  const counts = useMemo(() => countsFor(results), [results]);
  const filtered = useMemo(() => filterByScope(results, scope), [results, scope]);

  const rescueTarget = useMemo(() => selectRescueTarget(scope, counts), [scope, counts]);
  const rescue = useMemo(() => {
    if (!rescueTarget || scope === 'all' || scope === 'user') return null;
    return {
      target: rescueTarget,
      copy: rescueCopy(trimmed, scope, rescueTarget),
      rows: filterByScope(results, rescueTarget).slice(0, 2),
    };
  }, [rescueTarget, scope, trimmed, results]);

  const contentLoading = scope === 'user' ? usersLoading : moviesLoading || tvLoading;
  const userCount = scope === 'user' && !usersLoading ? users.length : null;

  // Keep the existing movie:search event alive (fires on title results).
  useEffect(() => {
    if (showResults && !moviesLoading) {
      analytics.track('movie:search', { query: trimmed, result_count: movies.length });
    }
  }, [trimmed, movies.length, moviesLoading, showResults]);

  // Fire search:v2_rescue_shown once per (query, from, to).
  const lastRescueKey = useRef<string | null>(null);
  useEffect(() => {
    if (!rescue) {
      lastRescueKey.current = null;
      return;
    }
    const key = `${trimmed}|${scope}|${rescue.target}`;
    if (lastRescueKey.current !== key) {
      lastRescueKey.current = key;
      analytics.track('search:v2_rescue_shown', { from_scope: scope, to_scope: rescue.target });
    }
  }, [rescue, trimmed, scope]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  const handleScopeChange = useCallback(
    (next: SearchScope) => {
      setScope((prev) => {
        if (prev !== next) {
          analytics.track('search:v2_scope_change', { from_scope: prev, to_scope: next });
        }
        return next;
      });
    },
    []
  );

  const openResult = useCallback(
    (result: UnifiedResult) => {
      if (result.scope === 'movie') {
        const m = result.raw as TMDBMovie;
        addRecentSearch({
          type: 'movie',
          title: m.title,
          subtitle: m.release_date?.split('-')[0] || 'Movie',
          posterUrl: getTMDBImageUrl(m.poster_path, 'w92') || undefined,
          tmdbId: m.id,
        });
        router.push(`/movie/${m.id}`);
      } else if (result.scope === 'tv') {
        const s = result.raw as TMDBTvShow;
        addRecentSearch({
          type: 'tv',
          title: s.name,
          subtitle: s.first_air_date?.split('-')[0] || 'TV Show',
          posterUrl: getTMDBImageUrl(s.poster_path, 'w92') || undefined,
          tmdbId: s.id,
        });
        router.push(`/tv/${s.id}`);
      } else {
        const p = result.raw as TMDBActor;
        addRecentSearch({
          type: 'person',
          title: p.name,
          subtitle: 'Person',
          posterUrl: getTMDBImageUrl(p.profile_path, 'w92') || undefined,
          tmdbId: p.id,
        });
        router.push(`/person/${p.id}`);
      }
    },
    [addRecentSearch]
  );

  const handleRecentPress = useCallback((search: RecentSearch) => {
    if (search.type === 'tv') router.push(`/tv/${search.tmdbId}`);
    else if (search.type === 'person') router.push(`/person/${search.tmdbId}`);
    else router.push(`/movie/${search.tmdbId}`);
  }, []);

  // Typing exits any browse/coming-soon state and returns to the query flow.
  const handleQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.length > 0) {
      setBrowseGenre(null);
      setComingSoonShelf(null);
    }
  }, []);

  const handleGenrePress = useCallback((genre: { id: number; name: string }) => {
    setComingSoonShelf(null);
    setSearchQuery('');
    setBrowseGenre(genre);
    analytics.track('search:v2_browse', { genre_id: genre.id, genre_name: genre.name });
  }, []);

  const handleClearBrowse = useCallback(() => setBrowseGenre(null), []);

  const handleShelfPress = useCallback((name: string) => setComingSoonShelf(name), []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ContentContainer style={styles.flex}>
        {/* Header — field + scope chips (the "asking" zone) */}
        <View style={styles.header}>
          <View style={styles.topRow}>
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <BackIcon color={colors.text} />
            </Pressable>

            <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SearchIconSvg color={colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Titles, people, lists…"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Search titles, people, and lists"
                value={searchQuery}
                onChangeText={handleQueryChange}
                autoFocus
                returnKeyType="search"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <XIcon color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>

          {showResults && (
            <View style={styles.chips}>
              <ScopeChips
                active={scope}
                counts={counts}
                userCount={userCount}
                onChange={handleScopeChange}
              />
            </View>
          )}
        </View>

        {/* The tear — separates asking from finding */}
        <View style={styles.tearBleed}>
          <TearLine />
        </View>

        {showResults ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {contentLoading ? (
              isOffline ? (
                <EmptyBlock
                  colors={colors}
                  title="You’re offline"
                  body="Connect to the internet to search"
                />
              ) : (
                <SearchSkeletonList cardColor={colors.card} shimmerColor={colors.backgroundSecondary} />
              )
            ) : scope === 'user' ? (
              users.length === 0 ? (
                <EmptyBlock colors={colors} title="No users found" body="Try a different username" />
              ) : (
                users.map((u) => (
                  <UserSearchResult key={u.id} user={u} onPress={() => router.push(`/user/${u.id}`)} />
                ))
              )
            ) : filtered.length > 0 ? (
              <>
                <Text style={[styles.micro, { color: colors.textTertiary }]}>Top result</Text>
                {filtered.map((result, i) => (
                  <ResultRow
                    key={result.key}
                    result={result}
                    onPress={openResult}
                    isFirst={i === 0}
                  />
                ))}
              </>
            ) : rescue ? (
              <View style={styles.rescue}>
                <Text style={[styles.rescueLead, { color: colors.text }]}>
                  {rescue.copy.lead}
                  <Text style={{ color: colors.tint }}>{rescue.copy.emphasis}</Text>
                </Text>
                <Text style={[styles.micro, styles.rescueMicro, { color: colors.textTertiary }]}>
                  Found elsewhere
                </Text>
                {rescue.rows.map((result, i) => (
                  <ResultRow
                    key={result.key}
                    result={result}
                    onPress={openResult}
                    highlighted
                    isFirst={i === 0}
                  />
                ))}
                <Pressable
                  onPress={() => handleScopeChange(rescue.target)}
                  accessibilityRole="button"
                  accessibilityLabel={rescue.copy.cta}
                  style={({ pressed }) => [
                    styles.rescueCta,
                    { borderColor: colors.tint, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.rescueCtaText, { color: colors.tint }]}>{rescue.copy.cta}</Text>
                </Pressable>
              </View>
            ) : (
              <EmptyBlock colors={colors} title="No results found" body="Try a different search term" />
            )}
          </ScrollView>
        ) : browseActive ? (
          <FlatList
            style={styles.flex}
            data={browseResults}
            keyExtractor={(item) => item.key}
            renderItem={({ item, index }) => (
              <ResultRow result={item} onPress={openResult} isFirst={index === 0} />
            )}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.browseHeader}>
                <Pressable
                  onPress={handleClearBrowse}
                  accessibilityRole="button"
                  accessibilityLabel="Back to browse the archive"
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={[styles.browseBack, { color: colors.tint }]}>← Browse</Text>
                </Pressable>
                <Text style={[styles.micro, styles.browseLabel, { color: colors.textTertiary }]}>
                  {browseGenre?.name} · {genreSerial(browseGenre?.id ?? 0)}
                </Text>
              </View>
            }
            ListEmptyComponent={
              browseLoading ? (
                isOffline ? (
                  <EmptyBlock
                    colors={colors}
                    title="You’re offline"
                    body="Connect to the internet to browse"
                  />
                ) : (
                  <SearchSkeletonList cardColor={colors.card} shimmerColor={colors.backgroundSecondary} />
                )
              ) : (
                <EmptyBlock colors={colors} title="No results found" body="Nothing on this shelf right now" />
              )
            }
            onEndReached={() => {
              if (browseHasNext && !browseFetchingNext) fetchNextBrowsePage();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              browseFetchingNext ? (
                <View style={styles.browseFooter}>
                  <ActivityIndicator size="small" color={colors.tint} />
                </View>
              ) : null
            }
          />
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {recentSearches.length > 0 && (
              <>
                <Text style={[styles.micro, { color: colors.textTertiary }]}>From your log</Text>
                {recentSearches.map((search) => (
                  <Pressable
                    key={search.id}
                    onPress={() => handleRecentPress(search)}
                    accessibilityRole="button"
                    accessibilityLabel={`${search.title}, ${search.subtitle}`}
                    style={({ pressed }) => [
                      styles.logRow,
                      { borderBottomColor: colors.border },
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.logQuery, { color: colors.text }]} numberOfLines={1}>
                      {search.title}
                    </Text>
                    <Text style={[styles.logDate, { color: colors.textTertiary }]}>
                      {formatLedgerDate(search.timestamp)}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}

            <Text
              style={[
                styles.micro,
                recentSearches.length > 0 && styles.rackLabelSpaced,
                { color: colors.textTertiary },
              ]}
            >
              Browse the archive
            </Text>
            <View style={styles.genreGrid}>
              {BROWSE_GENRES.map((genre) => (
                <GenreStub
                  key={`g${genre.id}`}
                  name={genre.name}
                  serial={genreSerial(genre.id)}
                  width={tileWidth}
                  onPress={() => handleGenrePress(genre)}
                  accessibilityLabel={`Browse ${genre.name}`}
                />
              ))}
              {COMPANY_SHELVES.map((shelf) => (
                <GenreStub
                  key={`c${shelf.name}`}
                  name={shelf.name}
                  serial={shelf.serial}
                  width={tileWidth}
                  onPress={() => handleShelfPress(shelf.name)}
                  accessibilityLabel={`${shelf.name}, curated shelf`}
                />
              ))}
            </View>
            {comingSoonShelf && (
              <Text style={[styles.shelfNotice, { color: colors.textTertiary }]}>
                {comingSoonShelf} — curated shelf coming soon
              </Text>
            )}
          </ScrollView>
        )}
      </ContentContainer>
    </SafeAreaView>
  );
}

function EmptyBlock({
  colors,
  title,
  body,
}: {
  colors: (typeof Colors)['dark'];
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    ...(Platform.OS === 'web' && { paddingTop: Spacing.md }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
  chips: {
    marginTop: 14,
  },
  tearBleed: {
    marginHorizontal: 0,
    paddingHorizontal: Spacing.md,
    marginTop: 4,
  },
  resultsContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  micro: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
    marginBottom: 10,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptyBody: {
    fontSize: 16,
    textAlign: 'center',
  },
  // Rescue ("no wrong door")
  rescue: {
    paddingTop: Spacing.sm,
  },
  rescueLead: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  rescueMicro: {
    marginTop: 16,
  },
  rescueCta: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  rescueCtaText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Idle "ledger" rows
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  logQuery: {
    flex: 1,
    fontSize: 14,
  },
  logDate: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  // Browse the archive rack
  rackLabelSpaced: {
    marginTop: 20,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  shelfNotice: {
    fontSize: 12.5,
    marginTop: Spacing.md,
    fontStyle: 'italic',
  },
  // Genre browse results
  browseHeader: {
    marginBottom: Spacing.sm,
  },
  browseBack: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  browseLabel: {
    marginBottom: 4,
  },
  browseFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
