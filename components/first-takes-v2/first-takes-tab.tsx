/**
 * FirstTakesTab — the redesigned First Takes profile tab (design contract 01.2).
 *
 * "The back of the stub": the latest take renders as a torn stub-back hero with
 * the quote as the artifact; earlier takes fall to quiet ledger rows separated
 * by flat perforations. Optional All/Movies/TV scope chips (only when the user
 * has both media types) filter the one combined chronological diary client-side.
 *
 * Shared by BOTH profile screens (own + user/[id]); the caller supplies the
 * fetched takes, load/error state, and navigation callbacks. Data source is
 * unchanged from the legacy tab.
 */

import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { formatRelativeTime } from '@/lib/utils';
import type { FirstTake } from '@/lib/database.types';
import {
  scopeCounts,
  shouldShowScopeChips,
  filterTakesByScope,
  splitHeroAndRest,
  type FirstTakesScope,
} from '@/lib/first-takes-v2-logic';
import { FirstTakesScopeChips } from './scope-chips';
import { HeroTake } from './hero-take';
import { LedgerRow } from './ledger-row';
import { Perforation } from './perforation';
import { FirstTakesEmpty, FirstTakesSkeleton, FirstTakesError } from './states';

interface FirstTakesTabProps {
  takes: FirstTake[];
  loading: boolean;
  error: boolean;
  /** True on the signed-in user's own profile — unlocks the "Log a film" CTA. */
  isOwn: boolean;
  onRetry: () => void;
  onPressTake: (id: string) => void;
  onLogFilm?: () => void;
}

export function FirstTakesTab({
  takes,
  loading,
  error,
  isOwn,
  onRetry,
  onPressTake,
  onLogFilm,
}: FirstTakesTabProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [scope, setScope] = useState<FirstTakesScope>('all');

  if (loading) return <FirstTakesSkeleton />;
  if (error) return <FirstTakesError onRetry={onRetry} />;
  if (takes.length === 0) return <FirstTakesEmpty isOwn={isOwn} onLogFilm={onLogFilm} />;

  const counts = scopeCounts(takes);
  const showScope = shouldShowScopeChips(takes);
  const visible = filterTakesByScope(takes, scope);
  const { hero, rest } = splitHeroAndRest(visible);

  return (
    <View style={styles.wrap}>
      {showScope && (
        <View style={styles.scopeRow}>
          <FirstTakesScopeChips active={scope} counts={counts} onChange={setScope} />
        </View>
      )}

      {hero && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            Latest take · {formatRelativeTime(hero.created_at ?? '')}
          </Text>
          {/* Keyed by take id: the hero renders at a fixed position, and
              SpoilerRedaction holds its reveal in local state — without a key,
              React reconciles by position and a NEW spoiler hero (scope switch
              or refetch) would inherit the previous reveal and show unredacted.
              The key remounts it so each hero starts redacted. */}
          <HeroTake key={hero.id} take={hero} onPress={() => onPressTake(hero.id)} />
        </>
      )}

      {rest.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, styles.earlierLabel, { color: colors.textTertiary }]}>
            Earlier
          </Text>
          {rest.map((take, index) => (
            <View key={take.id}>
              {index > 0 && <Perforation />}
              <LedgerRow take={take} onPress={() => onPressTake(take.id)} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // 12 (was 16): Ty round 1 flagged unused side room — buys the stub more
    // presence. Moves hero + ledger rows + section labels together; interior
    // card padding (TornStub / ledger row) is unchanged.
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  scopeRow: {
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: 2,
  },
  earlierLabel: {
    marginTop: 22,
  },
});
