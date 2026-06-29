/**
 * Ticket Scan v2 — `PickerOverlay`.
 *
 * Native recreation of the prototype's stacked picker sheet. The sheet is
 * content-height (capped at 90%) so there's no empty bottom gap; the time
 * picker's "Set time" CTA lives in a sticky footer that owns the home-indicator
 * inset and is always reachable. Rendered as an absolute overlay INSIDE the Edit
 * sheet's modal so it never dismisses the parent sheet or loses its scroll
 * position (README "Critical native-platform").
 *
 * Hosts, by `kind`:
 *  - `movie`  → live movie search (reuses `use-movie-search` +
 *               `TicketMovieSearchResult`, same pattern as ResolveDialog). This
 *               is the ONLY scrollable picker (long/dynamic results).
 *  - `format` / `rated` / `type` → radio lists.
 *  - `time`   → the Time Dial (`TimeWheel`).
 *  - `date`   → a custom month grid built from primitives.
 *
 * Single-choice pickers (radio / time / date) render in a plain content-height
 * View — no inner scroll — so the whole short list is visible at once and the
 * Time Dial's wheel columns are the only vertical scrollers (a nested same-axis
 * ScrollView would otherwise swallow their drag on Android). The time picker
 * commits via the sheet's sticky footer; radio/date commit on tap.
 *
 * Dark-only: built from `ScanV2Colors`/`ScanV2Accent`; all text via `ScanText`,
 * sizes via `s()`.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { TicketMovieSearchResult } from '@/components/ticket-movie-search-result';
import type { TMDBMovie } from '@/lib/tmdb.types';
import { Icon, ScanText, PillButton } from './primitives';
import { TimeWheel, parseTimeLabel } from './time-wheel';

export type PickerKind = 'movie' | 'format' | 'rated' | 'type' | 'time' | 'date';

export const FORMATS = ['Standard', 'IMAX', 'Dolby Cinema', '3D', 'RPX', '70mm'];
export const RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];
export const TICKET_TYPES = ['Adult', 'Child', 'Senior', 'Matinee', 'Student', 'Military'];

const PICKER_TITLES: Record<PickerKind, string> = {
  movie: 'Find the movie',
  format: 'Format',
  rated: 'Rating',
  type: 'Ticket type',
  time: 'Showtime',
  date: 'Date',
};

interface PickerOverlayProps {
  kind: PickerKind;
  /** Current radio value (format/rated/type), time label, or ISO date. */
  currentValue?: string;
  /** Current movie (for `kind === 'movie'`). */
  currentMovie?: TMDBMovie | null;
  /** Picked radio value / time label / ISO date. */
  onPickValue: (value: string) => void;
  /** Picked movie. */
  onPickMovie: (movie: TMDBMovie) => void;
  onClose: () => void;
}

export function PickerOverlay({
  kind,
  currentValue,
  currentMovie,
  onPickValue,
  onPickMovie,
  onClose,
}: PickerOverlayProps) {
  const insets = useSafeAreaInsets();
  const radioItems =
    kind === 'format' ? FORMATS : kind === 'rated' ? RATINGS : kind === 'type' ? TICKET_TYPES : null;

  // Live time label, kept in sync by the wheel, committed by the sticky footer.
  const [timeLabel, setTimeLabel] = useState(() => {
    const t = parseTimeLabel(currentValue);
    return `${t.h}:${String(t.min).padStart(2, '0')} ${t.ap}`;
  });

  // Single-choice pickers (radio / date) commit on tap, so their last option
  // just needs to clear the home indicator. The time picker commits from its
  // sticky footer, which owns the safe-area inset instead.
  const bodyBottom = s(20) + (kind === 'time' ? 0 : insets.bottom);

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 40, justifyContent: 'flex-end' } as any}>
      {/* Strong scrim: fully hide the Edit ticket screen behind the picker so it
          reads as a single takeover (a weak dim made it look like two stacked
          screens — the form's chips/"Add row" peeking through were confusing). */}
      <Pressable
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)' } as any}
        onPress={onClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: '100%' }}
      >
        <View
          style={{
            backgroundColor: ScanV2Colors.surface,
            borderTopLeftRadius: s(24),
            borderTopRightRadius: s(24),
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: ScanV2Colors.line,
            // Content-height sheet (no fixed/min height → no empty bottom gap),
            // capped so the tallest body (3 time wheels + label + footer) fits.
            maxHeight: '90%',
            overflow: 'hidden',
          }}
        >
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(10) }}>
            <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: ScanV2Colors.text }}>
              {PICKER_TITLES[kind]}
            </ScanText>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: ScanV2Colors.field, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={s(16)} color={ScanV2Colors.sec} />
            </Pressable>
          </View>

          {kind === 'movie' ? (
            <MoviePicker onSelect={onPickMovie} currentId={currentMovie?.id ?? null} />
          ) : (
            // Single-choice pickers: content-height, all options visible, no
            // inner scroll (keeps the Time Dial wheels as the only scrollers).
            // `flexShrink` lets the body yield to the sticky footer if the
            // viewport is short, so the action button is never pushed off-screen.
            <View style={{ flexShrink: 1, paddingHorizontal: s(16), paddingTop: s(2), paddingBottom: bodyBottom }}>
              {radioItems && <RadioList items={radioItems} current={currentValue} onPick={onPickValue} />}
              {kind === 'time' && <TimeWheel current={currentValue} onChange={setTimeLabel} />}
              {kind === 'date' && <DateGrid currentISO={currentValue || ''} onPick={onPickValue} />}
            </View>
          )}

          {/* Sticky footer — the time picker's only commit path; always visible
              regardless of content height, with the home-indicator inset. */}
          {kind === 'time' && (
            <View
              style={{
                flexShrink: 0,
                paddingHorizontal: s(16),
                paddingTop: s(8),
                paddingBottom: insets.bottom + s(12),
              }}
            >
              <PillButton full icon="check" label="Set time" onPress={() => onPickValue(timeLabel)} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================================
// Radio list (format / rating / ticket type)
// ============================================================================

function RadioList({ items, current, onPick }: { items: string[]; current?: string; onPick: (v: string) => void }) {
  return (
    <View style={{ gap: s(10) }}>
      {items.map((it) => {
        const on = it === current;
        return (
          <Pressable
            key={it}
            onPress={() => onPick(it)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: s(56),
              paddingVertical: s(14),
              paddingHorizontal: s(14),
              borderRadius: s(12),
              backgroundColor: on ? ScanV2Accent.soft : 'transparent',
              borderWidth: 1,
              borderColor: on ? ScanV2Accent.primary : ScanV2Colors.line,
            }}
          >
            <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(15.5), lineHeight: s(19), color: on ? ScanV2Accent.primary : ScanV2Colors.text }}>
              {it}
            </ScanText>
            {on && <Icon name="check" size={s(18)} color={ScanV2Accent.primary} stroke={2.6} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ============================================================================
// Movie search (reuses use-movie-search + TicketMovieSearchResult)
// ============================================================================

function MoviePicker({ onSelect, currentId }: { onSelect: (movie: TMDBMovie) => void; currentId: number | null }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const enabled = debounced.trim().length >= 2;
  const { movies, isLoading, isFetching } = useMovieSearch({ query: debounced, enabled });
  const showSpinner = (isLoading || isFetching) && enabled;

  return (
    <View style={{ maxHeight: '100%' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(8),
          marginHorizontal: s(16),
          marginBottom: s(10),
          paddingVertical: s(10),
          paddingHorizontal: s(12),
          backgroundColor: ScanV2Colors.field,
          borderWidth: 1,
          borderColor: ScanV2Colors.fieldLine,
          borderRadius: s(12),
        }}
      >
        <Icon name="search" size={s(17)} color={ScanV2Colors.sec} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title…"
          placeholderTextColor={ScanV2Colors.ter}
          autoFocus
          allowFontScaling={false}
          style={{ flex: 1, color: ScanV2Colors.text, fontFamily: Fonts.inter.regular, fontSize: s(15), padding: 0 }}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: s(8), paddingBottom: s(24) }}
        showsVerticalScrollIndicator={false}
      >
        {showSpinner && (
          <View style={{ paddingVertical: s(20), alignItems: 'center' }}>
            <ActivityIndicator size="small" color={ScanV2Accent.primary} />
          </View>
        )}
        {!showSpinner && enabled && movies.length === 0 && (
          <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13), color: ScanV2Colors.ter, textAlign: 'center', paddingVertical: s(20) }}>
            No matches — try another title
          </ScanText>
        )}
        {movies.map((movie) => (
          <View
            key={movie.id}
            style={
              movie.id === currentId
                ? { borderRadius: s(12), borderWidth: 1, borderColor: ScanV2Accent.primary, backgroundColor: ScanV2Accent.soft }
                : undefined
            }
          >
            <TicketMovieSearchResult movie={movie} onSelect={onSelect} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Date — custom month grid (built from primitives, no native date dialog)
// ============================================================================

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: parseInt(match[1], 10), m: parseInt(match[2], 10) - 1, d: parseInt(match[3], 10) };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function DateGrid({ currentISO, onPick }: { currentISO: string; onPick: (iso: string) => void }) {
  const seed = useMemo(() => parseISO(currentISO) ?? null, [currentISO]);
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(seed ? seed.y : now.getFullYear());
  const [viewMonth, setViewMonth] = useState(seed ? seed.m : now.getMonth());

  const lead = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const step = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const navBtn = (icon: 'chevL' | 'chevR', onPress: () => void) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ width: s(34), height: s(34), borderRadius: 999, backgroundColor: ScanV2Colors.field, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={s(18)} color={ScanV2Colors.text} />
    </Pressable>
  );

  return (
    <View>
      {/* month nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(12) }}>
        {navBtn('chevL', () => step(-1))}
        <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(15), lineHeight: s(19), color: ScanV2Colors.text }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </ScanText>
        {navBtn('chevR', () => step(1))}
      </View>

      {/* weekday header */}
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d, i) => (
          <View key={`h${i}`} style={{ flex: 1, alignItems: 'center', paddingVertical: s(4) }}>
            <ScanText style={{ fontFamily: Fonts.mono.regular, fontSize: s(10), color: ScanV2Colors.ter }}>{d}</ScanText>
          </View>
        ))}
      </View>

      {/* day grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (d == null) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const iso = toISO(viewYear, viewMonth, d);
          const on = iso === currentISO;
          return (
            <View key={iso} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: s(2) }}>
              <Pressable
                onPress={() => onPick(iso)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? ScanV2Accent.primary : 'transparent',
                }}
              >
                <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), lineHeight: s(17), color: on ? ScanV2Accent.on : ScanV2Colors.text }}>
                  {d}
                </ScanText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
