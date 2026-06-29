/**
 * Ticket Scan v2 — `JourneyCard` (the v2 `JourneyTicket`).
 *
 * Native re-skin of the design prototype's `JourneyTicket` (`scan-screens3.jsx`)
 * over the EXISTING v1 journey data (`UserMovie` + joined `first_takes`). Display
 * only — the edit pencil routes to the v1 edit screen (PR 5 swaps it for the v2
 * EditSheet).
 *
 * FRONT — a flex poster (Original / AI art) with glass flip + edit buttons and a
 * rose `THEATRICAL RUN` tag, a perforation seam (dashed line + two bg-colored
 * notch circles), then a content-sized stub: title + italic rating header and a
 * 2-page carousel (details grid / "Your First Take"), with page dots when a take
 * exists.
 *
 * BACK — a crossfade (the inner face is keyed on `flipped` so it re-mounts and
 * fades; NO 3D transform): an emerald "Verified theater visit" pill, a
 * decorative barcode, the real `ticket_id` confirmation code, and a footer.
 *
 * Dark-only (built from `ScanV2Colors`/`ScanV2Accent`, never the theme-aware
 * `Colors`); text via `ScanText`, sizes via `s()`.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Pressable, Animated } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { SignedPhoto } from '@/components/journey/signed-photo';
import type { UserMovie, FirstTake } from '@/lib/database.types';
import { Icon, ScanText } from './primitives';
import { AvatarStack, type AvatarStackPerson } from './avatar-stack';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPrice(price: number | null): string | null {
  if (price === null || price === undefined) return null;
  return `$${price.toFixed(2)}`;
}

function buildSeat(journey: UserMovie): { label: string; value: string } | null {
  const seat = journey.seat_location?.trim() || null;
  const aud = journey.auditorium?.trim() || null;
  if (seat && aud) return { label: 'Seat · Aud', value: `${seat} · ${aud}` };
  if (seat) return { label: 'Seat', value: seat };
  if (aud) return { label: 'Aud', value: aud };
  return null;
}

interface StubFieldData {
  label: string;
  value?: string | null;
  node?: React.ReactNode;
}

// ============================================================================
// Crossfade — fades a fresh face in on mount (re-mount via key change)
// ============================================================================

function FadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

// ============================================================================
// Glass round button (flip / edit overlay on the poster)
// ============================================================================

function GlassButton({
  onPress,
  side,
  children,
}: {
  onPress: () => void;
  side: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        top: s(12),
        [side]: s(12),
        width: s(36),
        height: s(36),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
      }}
    >
      {children}
    </Pressable>
  );
}

// Flip glyph — not in the shared Icon set, so drawn inline (design `flip` path).
function FlipGlyph({ size, color }: { size: number; color: string }) {
  const p = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...p} d="M4 9a8 8 0 0 1 14-3l2 2" />
      <Path {...p} d="M20 5v4h-4" />
      <Path {...p} d="M20 15a8 8 0 0 1-14 3l-2-2" />
      <Path {...p} d="M4 19v-4h4" />
    </Svg>
  );
}

// ============================================================================
// Perforation seam — dashed line + two bg-colored notch circles
// ============================================================================

const SEAM_DASHES = 22;

function PerforationSeam() {
  const notch = s(11);
  return (
    <View style={{ height: 0, zIndex: 2 }}>
      <View
        style={{
          position: 'absolute',
          left: s(13),
          right: s(13),
          top: -1,
          height: 2,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {Array.from({ length: SEAM_DASHES }).map((_, i) => (
          <View key={i} style={{ width: s(6), height: 2, borderRadius: 1, backgroundColor: ScanV2Colors.lineHi }} />
        ))}
      </View>
      <View
        style={{
          position: 'absolute',
          left: -notch,
          top: -notch,
          width: notch * 2,
          height: notch * 2,
          borderRadius: notch,
          backgroundColor: ScanV2Colors.bg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: -notch,
          top: -notch,
          width: notch * 2,
          height: notch * 2,
          borderRadius: notch,
          backgroundColor: ScanV2Colors.bg,
        }}
      />
    </View>
  );
}

// ============================================================================
// Decorative barcode (vertical bars — not a real scannable code)
// ============================================================================

const BAR_WIDTHS = [
  2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2,
  3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1,
];

function Barcode({ height, color }: { height: number; color: string }) {
  const VB_W = 176;
  const VB_H = 45;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
      {BAR_WIDTHS.map((w, index) => {
        const x = BAR_WIDTHS.slice(0, index).reduce((sum, bw) => sum + bw + 2, 0);
        if (x + w > VB_W) return null;
        return <Rect key={index} x={x} y={0} width={w} height={VB_H} fill={color} />;
      })}
    </Svg>
  );
}

// ============================================================================
// StubField — renders nothing when empty
// ============================================================================

function StubField({ label, value, node }: StubFieldData) {
  if (!value && !node) return null;
  return (
    <View style={{ width: '47%', minWidth: 0, marginBottom: s(15) }}>
      <ScanText
        style={{
          fontFamily: Fonts.mono.medium,
          fontSize: s(10),
          letterSpacing: 1.3,
          color: ScanV2Colors.ter,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </ScanText>
      {node ? (
        <View style={{ marginTop: s(5), flexDirection: 'row', alignItems: 'center' }}>{node}</View>
      ) : (
        <ScanText
          style={{
            fontFamily: Fonts.inter.semibold,
            fontSize: s(15.5),
            color: ScanV2Colors.text,
            marginTop: s(3),
            lineHeight: s(18.6),
          }}
        >
          {value}
        </ScanText>
      )}
    </View>
  );
}

// ============================================================================
// JourneyCard
// ============================================================================

export interface JourneyCardProps {
  journey: UserMovie;
  firstTake: FirstTake | null;
  companions: AvatarStackPerson[];
  /** Whether the AI poster is the active variant (derived from display_poster). */
  showAi: boolean;
  flipped: boolean;
  onFlip: () => void;
  page: number;
  setPage: (page: number) => void;
  onEdit: () => void;
  /** Fixed height the card fills so the poster flexes above the content stub. */
  height: number;
}

export function JourneyCard({
  journey,
  firstTake,
  companions,
  showAi,
  flipped,
  onFlip,
  page,
  setPage,
  onEdit,
  height,
}: JourneyCardProps) {
  const rating = firstTake?.rating ?? null;
  const note = firstTake?.quote_text?.trim() || null;
  const hasTake = rating != null || !!note;

  const posterUri = useMemo(() => {
    if (showAi && journey.ai_poster_url) return journey.ai_poster_url;
    return getTMDBImageUrl(journey.poster_path ?? null, 'w780');
  }, [showAi, journey.ai_poster_url, journey.poster_path]);

  const fields: StubFieldData[] = useMemo(() => {
    const seat = buildSeat(journey);
    const list: StubFieldData[] = [
      { label: 'Date', value: formatDate(journey.watched_at) },
      { label: 'Cinema', value: journey.location_name?.trim() || journey.theater_chain?.trim() || null },
      seat ? { label: seat.label, value: seat.value } : { label: 'Seat', value: null },
      { label: 'Format', value: journey.watch_format ? journey.watch_format.toUpperCase() : null },
      {
        label: 'With',
        node: companions.length ? (
          <AvatarStack
            people={companions}
            max={3}
            size={s(28)}
            ringColor={showAi ? '#100b18' : ScanV2Colors.card}
          />
        ) : undefined,
      },
      { label: 'Paid', value: formatPrice(journey.ticket_price) },
    ];
    return list.filter((f) => f.value || f.node);
  }, [journey, companions, showAi]);

  const ticketId = journey.ticket_id || `CNTK-${journey.id.slice(0, 8).toUpperCase()}`;
  const stubBg = showAi ? '#100b18' : ScanV2Colors.card;

  const front = (
    <View style={{ flex: 1, minHeight: Math.min(s(520), height) }}>
      {/* Poster */}
      <View
        style={{
          flex: 1,
          minHeight: s(270),
          maxHeight: s(580),
          borderTopLeftRadius: s(22),
          borderTopRightRadius: s(22),
          overflow: 'hidden',
          backgroundColor: ScanV2Colors.card,
          borderWidth: showAi ? 1 : 0,
          borderColor: showAi ? ScanV2Accent.soft : 'transparent',
        }}
      >
        {posterUri ? (
          <SignedPhoto
            expoImage
            uri={posterUri}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            transition={200}
          />
        ) : null}

        <GlassButton side="left" onPress={onFlip}>
          <FlipGlyph size={s(17)} color="#fff" />
        </GlassButton>
        <GlassButton side="right" onPress={onEdit}>
          <Icon name="pencil" size={s(17)} color="#fff" />
        </GlassButton>

        {/* THEATRICAL RUN status tag (theater-hardcoded by design) */}
        <View
          style={{
            position: 'absolute',
            right: s(14),
            bottom: s(14),
            paddingVertical: s(6),
            paddingHorizontal: s(11),
            borderRadius: s(8),
            backgroundColor: ScanV2Accent.primary,
          }}
        >
          <ScanText
            style={{
              fontFamily: Fonts.mono.bold,
              fontSize: s(11),
              letterSpacing: 0.6,
              color: ScanV2Accent.on,
            }}
          >
            THEATRICAL RUN
          </ScanText>
        </View>
      </View>

      <PerforationSeam />

      {/* Stub */}
      <View
        style={{
          backgroundColor: stubBg,
          borderBottomLeftRadius: s(22),
          borderBottomRightRadius: s(22),
          borderWidth: 1,
          borderTopWidth: 0,
          borderColor: ScanV2Colors.line,
          paddingTop: s(18),
          paddingHorizontal: s(18),
          paddingBottom: s(14),
        }}
      >
        {/* Header: title + rating */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s(10) }}>
          <ScanText
            style={{
              flex: 1,
              fontFamily: Fonts.outfit.extrabold,
              fontSize: s(23),
              letterSpacing: -0.4,
              lineHeight: s(25.8),
              color: ScanV2Colors.text,
            }}
          >
            {journey.title}
          </ScanText>
          {rating != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', transform: [{ skewX: '-8deg' }] }}>
              <ScanText
                style={{
                  fontFamily: Fonts.outfit.extrabold,
                  fontSize: s(23),
                  letterSpacing: -0.4,
                  color: ScanV2Accent.primary,
                }}
              >
                {rating.toFixed(1)}
              </ScanText>
              <ScanText
                style={{
                  fontFamily: Fonts.outfit.bold,
                  fontSize: s(15),
                  color: ScanV2Accent.primary,
                  opacity: 0.55,
                }}
              >
                {' '}/ 10
              </ScanText>
            </View>
          ) : null}
        </View>

        {/* Carousel */}
        <View style={{ marginTop: s(18), minHeight: s(96) }}>
          {page === 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {fields.map((f, i) => (
                <StubField key={`${f.label}-${i}`} label={f.label} value={f.value} node={f.node} />
              ))}
            </View>
          ) : (
            <View>
              <ScanText
                style={{
                  fontFamily: Fonts.mono.medium,
                  fontSize: s(10),
                  letterSpacing: 1.3,
                  color: ScanV2Colors.ter,
                  textTransform: 'uppercase',
                  marginBottom: s(6),
                }}
              >
                Your First Take
              </ScanText>
              {note ? (
                <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(15), color: ScanV2Colors.text, lineHeight: s(22.5) }}>
                  {note}
                </ScanText>
              ) : (
                <ScanText
                  style={{
                    fontFamily: Fonts.inter.regular,
                    fontSize: s(14.5),
                    color: ScanV2Colors.ter,
                    fontStyle: 'italic',
                    lineHeight: s(21.75),
                  }}
                >
                  No take yet — tap the pencil to add your thoughts.
                </ScanText>
              )}
              {rating != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginTop: s(12) }}>
                  <View style={{ flex: 1, height: s(6), borderRadius: 999, backgroundColor: ScanV2Colors.field, overflow: 'hidden' }}>
                    <View style={{ width: `${rating * 10}%`, height: '100%', borderRadius: 999, backgroundColor: ScanV2Accent.primary }} />
                  </View>
                  <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(14), color: ScanV2Accent.primary }}>
                    {rating}/10
                  </ScanText>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Page dots / chevrons (only when a take exists) */}
        {hasTake ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(14), marginTop: s(12) }}>
            <Pressable
              onPress={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                width: s(32),
                height: s(32),
                borderRadius: 999,
                backgroundColor: ScanV2Colors.field,
                borderWidth: 1,
                borderColor: ScanV2Colors.line,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <Icon name="chevL" size={s(15)} color={ScanV2Colors.sec} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: s(6) }}>
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={{
                    width: page === i ? s(18) : s(6),
                    height: s(6),
                    borderRadius: 999,
                    backgroundColor: page === i ? ScanV2Accent.primary : ScanV2Colors.lineHi,
                  }}
                />
              ))}
            </View>
            <Pressable
              onPress={() => setPage(Math.min(1, page + 1))}
              disabled={page === 1}
              style={{
                width: s(32),
                height: s(32),
                borderRadius: 999,
                backgroundColor: ScanV2Colors.field,
                borderWidth: 1,
                borderColor: ScanV2Colors.line,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: page === 1 ? 0.4 : 1,
              }}
            >
              <Icon name="chevR" size={s(15)} color={ScanV2Colors.sec} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );

  const back = (
    <View style={{ flex: 1, minHeight: Math.min(s(520), height) }}>
      <View
        style={{
          flex: 1,
          borderRadius: s(22),
          borderWidth: 1,
          borderColor: ScanV2Colors.line,
          backgroundColor: ScanV2Colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(18),
          paddingVertical: s(34),
          paddingHorizontal: s(24),
        }}
      >
        <Pressable
          onPress={onFlip}
          style={{
            position: 'absolute',
            top: s(12),
            left: s(12),
            width: s(36),
            height: s(36),
            borderRadius: 999,
            backgroundColor: ScanV2Colors.field,
            borderWidth: 1,
            borderColor: ScanV2Colors.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FlipGlyph size={s(17)} color={ScanV2Colors.sec} />
        </Pressable>

        {/* Verified pill */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(6),
            paddingVertical: s(6),
            paddingHorizontal: s(12),
            borderRadius: 999,
            backgroundColor: 'rgba(16,185,129,0.14)',
          }}
        >
          <Icon name="check" size={s(14)} color={ScanV2Colors.emerald} stroke={2.6} />
          <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(12), color: ScanV2Colors.emerald }}>
            Verified theater visit
          </ScanText>
        </View>

        {/* Decorative barcode */}
        <View style={{ width: '78%' }}>
          <Barcode height={s(82)} color={ScanV2Colors.text} />
        </View>

        {/* Real confirmation code */}
        <ScanText
          style={{
            fontFamily: Fonts.mono.medium,
            fontSize: s(12),
            letterSpacing: 3,
            color: ScanV2Colors.sec,
          }}
        >
          {ticketId}
        </ScanText>

        {/* Footer */}
        <View style={{ alignItems: 'center', gap: s(3) }}>
          <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(16), color: ScanV2Colors.text }}>
            {journey.title}
          </ScanText>
          <ScanText
            style={{
              fontFamily: Fonts.mono.regular,
              fontSize: s(11),
              letterSpacing: 1,
              color: ScanV2Colors.ter,
            }}
          >
            {[journey.location_name?.trim() || journey.theater_chain?.trim(), formatDate(journey.watched_at)]
              .filter(Boolean)
              .join(' · ')
              .toUpperCase()}
          </ScanText>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ height, flexDirection: 'column', overflow: 'hidden' }}>
      <FadeIn key={flipped ? 'back' : 'front'}>{flipped ? back : front}</FadeIn>
    </View>
  );
}

export default JourneyCard;
