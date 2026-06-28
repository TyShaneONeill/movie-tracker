/**
 * Ticket Scan v2 — `ResolveDialog`.
 *
 * Centered RN Modal (NOT a bottom sheet) that enforces block-on-unknown: each
 * `failed` ticket gets Find movie (reuses `use-movie-search` +
 * `TicketMovieSearchResult`) / Remove. Selecting a movie resolves that ticket;
 * the dialog auto-closes once no `failed` tickets remain.
 *
 * Dark-only. `TicketMovieSearchResult` already renders against `Colors.dark.*`,
 * so it stays dark inside this surface regardless of the app theme.
 */

import React, { useEffect, useState } from 'react';
import { View, Modal, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { TicketMovieSearchResult } from '@/components/ticket-movie-search-result';
import type { TMDBMovie } from '@/lib/tmdb.types';
import type { TicketVM } from '@/lib/scan-v2/ticket-view-model';
import { Icon, ScanText, PillButton } from './primitives';

interface ResolveDialogProps {
  visible: boolean;
  failed: TicketVM[];
  readyCount: number;
  onResolveTicket: (id: string, movie: TMDBMovie) => void;
  onRemoveTicket: (id: string) => void;
  onSaveReady: () => void;
  onClose: () => void;
}

export function ResolveDialog({
  visible,
  failed,
  readyCount,
  onResolveTicket,
  onRemoveTicket,
  onSaveReady,
  onClose,
}: ResolveDialogProps) {
  const [searchingId, setSearchingId] = useState<string | null>(null);

  // Auto-close once every unknown movie is resolved or removed.
  useEffect(() => {
    if (visible && failed.length === 0) onClose();
  }, [visible, failed.length, onClose]);

  // Reset the search panel whenever the dialog is dismissed.
  useEffect(() => {
    if (!visible) setSearchingId(null);
  }, [visible]);

  const n = failed.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: s(20), paddingHorizontal: s(18) }}>
        <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.62)' } as any} onPress={onClose} />

        <View
          style={{
            backgroundColor: ScanV2Colors.surface,
            borderRadius: s(24),
            borderWidth: 1,
            borderColor: ScanV2Colors.line,
            overflow: 'hidden',
            maxHeight: '88%',
          }}
        >
          {searchingId ? (
            <SearchPanel
              onBack={() => setSearchingId(null)}
              onSelect={(movie) => {
                onResolveTicket(searchingId, movie);
                setSearchingId(null);
              }}
            />
          ) : (
            <>
              {/* header */}
              <View style={{ paddingHorizontal: s(20), paddingTop: s(20), paddingBottom: s(14), alignItems: 'center' }}>
                <View
                  style={{
                    width: s(52),
                    height: s(52),
                    borderRadius: 999,
                    backgroundColor: 'rgba(225,29,72,0.14)',
                    borderWidth: 1,
                    borderColor: 'rgba(225,29,72,0.3)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="warn" size={s(26)} color={ScanV2Accent.primary} />
                </View>
                <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(20), lineHeight: s(24), color: ScanV2Colors.text, marginTop: s(12), textAlign: 'center' }}>
                  {n === 1 ? 'One movie needs your help' : `${n} movies need your help`}
                </ScanText>
                <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13.5), lineHeight: s(20), color: ScanV2Colors.sec, marginTop: s(6), textAlign: 'center', maxWidth: s(300) }}>
                  {n === 1
                    ? "We couldn't match this ticket to a movie. Unknown movies can't be added — pick the title or remove it."
                    : "We couldn't match these tickets to a movie. Unknown movies can't be added — pick the title or remove them."}
                </ScanText>
              </View>

              {/* failed list */}
              <ScrollView contentContainerStyle={{ paddingHorizontal: s(16), paddingBottom: s(4), gap: s(10) }} showsVerticalScrollIndicator={false}>
                {failed.map((tkt) => {
                  const meta = [tkt.fields.date, tkt.fields.time, tkt.fields.format].filter(Boolean).join(' · ');
                  return (
                    <View key={tkt.id} style={{ backgroundColor: ScanV2Colors.card, borderWidth: 1, borderColor: ScanV2Colors.line, borderRadius: s(14), padding: s(12) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(11) }}>
                        <View style={{ width: s(38), height: s(54), borderRadius: s(8), backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="film" size={s(20)} color={ScanV2Colors.ter} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14.5), lineHeight: s(18), color: ScanV2Colors.text }}>Unknown movie</ScanText>
                          <ScanText numberOfLines={1} style={{ fontFamily: Fonts.inter.regular, fontSize: s(12), lineHeight: s(15), color: ScanV2Colors.ter, marginTop: s(2) }}>
                            {meta || 'No details read'}
                          </ScanText>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: s(8), marginTop: s(11) }}>
                        <PillButton icon="search" label="Find movie" onPress={() => setSearchingId(tkt.id)} style={{ flex: 2 }} />
                        <PillButton kind="ghost" icon="trash" label="Remove" onPress={() => onRemoveTicket(tkt.id)} style={{ flex: 1 }} />
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {/* footer */}
              <View style={{ paddingHorizontal: s(16), paddingTop: s(14), paddingBottom: s(16), gap: s(8), borderTopWidth: 1, borderTopColor: ScanV2Colors.line, marginTop: s(10) }}>
                {readyCount > 0 && (
                  <Pressable onPress={onSaveReady} style={{ minHeight: s(34), alignItems: 'center', justifyContent: 'center' }}>
                    <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), color: ScanV2Colors.sec }}>
                      Skip {n === 1 ? 'it' : 'them'} · save {readyCount} ready ticket{readyCount === 1 ? '' : 's'}
                    </ScanText>
                  </Pressable>
                )}
                <PillButton kind="ghost" full label="Keep reviewing" onPress={onClose} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Movie search panel (reuses use-movie-search + TicketMovieSearchResult)
// ============================================================================

function SearchPanel({ onBack, onSelect }: { onBack: () => void; onSelect: (movie: TMDBMovie) => void }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const { movies, isLoading, isFetching } = useMovieSearch({ query: debounced, enabled: debounced.trim().length >= 2 });
  const showSpinner = (isLoading || isFetching) && debounced.trim().length >= 2;

  return (
    <View style={{ maxHeight: '100%' }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), paddingHorizontal: s(16), paddingTop: s(18), paddingBottom: s(10) }}>
        <Pressable onPress={onBack} hitSlop={8} style={{ width: s(34), height: s(34), borderRadius: 999, backgroundColor: ScanV2Colors.field, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrowL" size={s(18)} color={ScanV2Colors.text} />
        </Pressable>
        <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: ScanV2Colors.text }}>Find the movie</ScanText>
      </View>

      {/* search field */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginHorizontal: s(16), marginBottom: s(10), paddingVertical: s(10), paddingHorizontal: s(12), backgroundColor: ScanV2Colors.field, borderWidth: 1, borderColor: ScanV2Colors.fieldLine, borderRadius: s(12) }}>
        <Icon name="search" size={s(17)} color={ScanV2Colors.sec} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by title…"
          placeholderTextColor={ScanV2Colors.ter}
          autoFocus
          allowFontScaling={false}
          style={{ flex: 1, color: ScanV2Colors.text, fontFamily: Fonts.inter.regular, fontSize: s(15), padding: 0 }}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: s(8), paddingBottom: s(24) }} showsVerticalScrollIndicator={false}>
        {showSpinner && (
          <View style={{ paddingVertical: s(20), alignItems: 'center' }}>
            <ActivityIndicator size="small" color={ScanV2Accent.primary} />
          </View>
        )}
        {!showSpinner && debounced.trim().length >= 2 && movies.length === 0 && (
          <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13), color: ScanV2Colors.ter, textAlign: 'center', paddingVertical: s(20) }}>
            No matches found.
          </ScanText>
        )}
        {movies.map((movie) => (
          <TicketMovieSearchResult key={movie.id} movie={movie} onSelect={onSelect} />
        ))}
      </ScrollView>
    </View>
  );
}
