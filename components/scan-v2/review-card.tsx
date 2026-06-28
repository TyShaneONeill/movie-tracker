/**
 * Ticket Scan v2 — `ReviewCard`.
 *
 * Recreates the prototype's ReviewCard: status rail (emerald matched / amber
 * review / rose failed), poster + title + theater, only-present chips
 * (datetime / seat / format), price + rated badge, and per-status affordance.
 *
 * Per-status affordance: matched → Edit (pencil, muted); review → Confirm match
 * (rose) — both open the Edit sheet; failed → Search manually (rose, opens the
 * Resolve dialog). Block-on-unknown is enforced at the screen level.
 */

import React from 'react';
import { View, Pressable, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TicketVM } from '@/lib/scan-v2/ticket-view-model';
import { Icon, ScanText, Chip, type ScanIconName } from './primitives';

interface ReviewCardProps {
  ticket: TicketVM;
  onSearch: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

function railColor(status: TicketVM['status']): string {
  if (status === 'matched') return ScanV2Colors.emerald;
  if (status === 'review') return ScanV2Colors.amber;
  return ScanV2Accent.primary;
}

export function ReviewCard({ ticket, onSearch, onRemove, onEdit }: ReviewCardProps) {
  const failed = ticket.status === 'failed';
  const review = ticket.status === 'review';
  const f = ticket.fields;
  const dateTime = [f.date, f.time].filter(Boolean).join(' · ');
  const posterUrl = ticket.movie ? getTMDBImageUrl(ticket.movie.posterPath, 'w185') : null;

  const chips: { icon: ScanIconName; label: string }[] = [];
  if (dateTime) chips.push({ icon: 'clock', label: dateTime });
  if (f.seatLabel) chips.push({ icon: 'seat', label: f.seatLabel });
  if (f.format) chips.push({ icon: 'film', label: f.format });

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: s(18),
        overflow: 'hidden',
        backgroundColor: ScanV2Colors.card,
        borderWidth: 1,
        borderColor: ScanV2Colors.line,
      }}
    >
      {/* status rail */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: s(4), backgroundColor: railColor(ticket.status) }} />

      <View style={{ flexDirection: 'row', gap: s(13), padding: s(14), paddingLeft: s(18) }}>
        {/* poster */}
        <View style={{ width: s(64), height: s(92), borderRadius: s(10), overflow: 'hidden', backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center' }}>
          {failed || !posterUrl ? (
            <Icon name="film" size={s(26)} color={ScanV2Colors.ter} />
          ) : (
            <Image source={{ uri: posterUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: s(7) }}>
          {/* title row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(8) }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {failed && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignSelf: 'flex-start',
                    alignItems: 'center',
                    gap: s(4),
                    paddingVertical: s(3),
                    paddingHorizontal: s(8),
                    borderRadius: 999,
                    backgroundColor: 'rgba(225,29,72,0.16)',
                    marginBottom: s(5),
                  }}
                >
                  <Icon name="warn" size={s(11)} color={ScanV2Accent.primary} />
                  <ScanText style={{ fontFamily: Fonts.mono.bold, fontSize: s(10.5), letterSpacing: 0.4, color: ScanV2Accent.primary }}>ACTION NEEDED</ScanText>
                </View>
              )}
              <ScanText
                style={{ fontFamily: Fonts.outfit.bold, fontSize: s(18), lineHeight: s(20.7), color: failed ? ScanV2Colors.sec : ScanV2Colors.text }}
              >
                {failed ? 'Unknown movie' : ticket.movie?.title ?? 'Unknown movie'}
              </ScanText>
              <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13), lineHeight: s(16), color: ScanV2Colors.sec, marginTop: s(2) }}>
                {failed ? "We couldn't read this ticket" : f.theater || 'Theater not detected'}
              </ScanText>
            </View>

            {/* status glyph (matched) */}
            {ticket.status === 'matched' && (
              <View style={{ width: s(22), height: s(22), borderRadius: 999, backgroundColor: 'rgba(16,185,129,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={s(14)} color={ScanV2Colors.emerald} stroke={2.6} />
              </View>
            )}
            <Pressable onPress={() => onRemove(ticket.id)} hitSlop={8} style={{ padding: s(2) }}>
              <Icon name="x" size={s(16)} color={ScanV2Colors.ter} />
            </Pressable>
          </View>

          {/* chips */}
          {chips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}>
              {chips.map((c, i) => (
                <Chip key={i} icon={c.icon} label={c.label} />
              ))}
            </View>
          )}

          {/* footer: price/rated + action */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: s(8), marginTop: s(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), flexWrap: 'wrap' }}>
              {f.price && <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(13.5), color: ScanV2Colors.text }}>{f.price}</ScanText>}
              {f.rated && (
                <View style={{ borderWidth: 1, borderColor: ScanV2Colors.fieldLine, paddingVertical: s(1), paddingHorizontal: s(5), borderRadius: s(4) }}>
                  <ScanText style={{ fontFamily: Fonts.mono.medium, fontSize: s(11), color: ScanV2Colors.sec }}>{f.rated}</ScanText>
                </View>
              )}
            </View>
            {failed && (
              <Pressable onPress={() => onSearch(ticket.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: s(5), padding: s(2) } as ViewStyle}>
                <Icon name="search" size={s(15)} color={ScanV2Accent.primary} />
                <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), color: ScanV2Accent.primary }}>Search manually</ScanText>
              </Pressable>
            )}
            {review && (
              <Pressable onPress={() => onEdit(ticket.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: s(5), padding: s(2) } as ViewStyle}>
                <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), color: ScanV2Accent.primary }}>Confirm match</ScanText>
                <Icon name="arrowR" size={s(15)} color={ScanV2Accent.primary} />
              </Pressable>
            )}
            {ticket.status === 'matched' && (
              <Pressable onPress={() => onEdit(ticket.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: s(5), padding: s(2) } as ViewStyle}>
                <Icon name="pencil" size={s(15)} color={ScanV2Colors.sec} />
                <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), color: ScanV2Colors.sec }}>Edit</ScanText>
              </Pressable>
            )}
          </View>

          {review && (
            <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(11.5), lineHeight: s(15), color: ScanV2Colors.amber, marginTop: s(1) }}>
              Some fields had low confidence — give them a glance.
            </ScanText>
          )}
        </View>
      </View>
    </View>
  );
}
