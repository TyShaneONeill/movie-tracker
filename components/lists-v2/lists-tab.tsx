/**
 * Lists v2 profile tab (design contract 01.2). Programme cards replace the dead
 * 2×2 grids: the Watchlist is a PILE, Watching is NOW PLAYING (movies + TV),
 * custom lists are calm fanned hands. Self-contained — it fetches its own data
 * (react-query dedups against the legacy tab's queries) so the profile seam stays
 * a one-line gate. Byte-identical legacy renders off-flag.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useUserLists } from '@/hooks/use-user-lists';
import { useWatchingList } from '@/hooks/use-watching-list';
import {
  formatDeepCount,
  formatSplitCount,
  watchingScopeCounts,
  nextEpisodeLabel,
  FAN_JITTER_WATCHING,
} from '@/lib/lists-v2-logic';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { ProgrammeCard } from './programme-card';
import { ListsSkeleton, ListsError } from './states';
import type { DeckItem } from './pile-card';

interface ListsTabV2Props {
  /** Flag still resolving — hold the skeleton rather than flash legacy. */
  resolving: boolean;
  /** Navigate to a list route, e.g. '/list/watchlist' or `/list/${id}`. */
  onOpenList: (route: string) => void;
  onCreateList: () => void;
}

export function ListsTabV2({ resolving, onOpenList, onCreateList }: ListsTabV2Props) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const { movies: watchlistMovies, isLoading: watchlistLoading } = useUserMovies('watchlist');
  const { items: watching, isLoading: watchingLoading, isError: watchingError } = useWatchingList();
  const {
    data: userLists,
    isLoading: listsLoading,
    isError: listsError,
    refetch: refetchLists,
  } = useUserLists();

  const loading = resolving || watchlistLoading || watchingLoading || listsLoading;
  if (loading) return <ListsSkeleton />;
  if (listsError || watchingError) return <ListsError onRetry={() => refetchLists()} />;

  const watchlistCount = watchlistMovies.length;
  const watchlistDeck: DeckItem[] = watchlistMovies.map((m) => ({
    key: `movie:${m.tmdb_id}`,
    tmdbId: m.tmdb_id,
    posterPath: m.poster_path,
    media: 'movie',
    title: m.title,
  }));

  const wCounts = watchingScopeCounts(watching);
  const watchingPosters = watching.slice(0, 4).map((w) => w.posterPath);
  const firstShow = watching.find((w) => w.media === 'tv');
  const showNext = firstShow ? nextEpisodeLabel(firstShow) : null;
  const watchingFineprint = firstShow && showNext ? `${firstShow.title} · ${showNext}` : undefined;

  return (
    <View style={styles.wrap}>
      {/* Watchlist — the interactive PILE deck (tap opens the list, drag cycles) */}
      <ProgrammeCard
        title="Watchlist"
        count={formatDeepCount(watchlistCount)}
        variant="deck"
        deckItems={watchlistDeck}
        posterPaths={[]}
        totalCount={watchlistCount}
        fineprint={watchlistCount > 0 ? "The lineup you're planning" : undefined}
        empty={watchlistCount === 0}
        emptyInvitation="Your watchlist is empty — add films to plan your next night."
        onPress={() => onOpenList('/list/watchlist')}
      />

      {/* Perforation separator (system pattern, #675 spacing) */}
      <View style={styles.perf}>
        <Perforation />
      </View>

      {/* Watching — Now Playing (movies + TV) */}
      <ProgrammeCard
        title="Watching"
        count={formatSplitCount(wCounts.movie, wCounts.tv)}
        variant="fan"
        posterPaths={watchingPosters}
        totalCount={wCounts.all}
        nowPlaying={wCounts.all > 0}
        jitter={FAN_JITTER_WATCHING}
        fineprint={watchingFineprint}
        fineprintChip={firstShow ? 'TV' : undefined}
        empty={wCounts.all === 0}
        emptyInvitation="Nothing's on the marquee — mark a film or show as Watching."
        onPress={() => onOpenList('/list/watching')}
      />

      {/* Custom lists — calm fanned hands */}
      {userLists && userLists.length > 0 && (
        <>
          <View style={styles.perf}>
            <Perforation />
          </View>
          <Text style={[styles.section, { color: colors.textSecondary }]}>YOUR LISTS</Text>
          {userLists.map((list) => (
            <ProgrammeCard
              key={list.id}
              title={list.name}
              count={formatSplitCount(list.movie_count, 0)}
              variant="fan"
              posterPaths={list.movies.map((m) => m.poster_path)}
              totalCount={list.movie_count}
              fineprint={list.description ?? undefined}
              onPress={() => onOpenList(`/list/${list.id}`)}
            />
          ))}
        </>
      )}

      {/* Create a list — dashed CTA, contract copy */}
      <View style={styles.perf}>
        <Perforation />
      </View>
      <Pressable
        onPress={onCreateList}
        accessibilityRole="button"
        accessibilityLabel="Create a list"
        style={({ pressed }) => [
          styles.create,
          { borderColor: effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf', opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.createTitle, { color: colors.text }]}>＋ Create a list</Text>
        <Text style={[styles.createSub, { color: colors.textSecondary }]}>
          A double feature, a marathon, a retrospective — programme it.
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  section: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 14,
    marginHorizontal: 2,
  },
  // Perforation separator breathing room (#675 spacing: ~12pt).
  perf: {
    marginTop: 12,
  },
  create: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 6,
  },
  createTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  createSub: {
    fontSize: 12,
    marginTop: 3,
    textAlign: 'center',
  },
});
