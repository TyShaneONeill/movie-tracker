/**
 * Ticket Scan v2 — live camera capture (`ScreenCamera`).
 *
 * Real viewfinder via expo-camera `<CameraView>`. Shutter -> 110ms white flash
 * -> `takePictureAsync({ base64: true })` -> hands the base64 up to the flow,
 * which runs the existing `useScanTicket().scanTicket` path. While the flow is
 * scanning, the `scanning` prop drives the "Reading your ticket…" overlay.
 *
 * Dark-only; recreates `ScreenCamera` from scan-screens.jsx.
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TicketVM } from '@/lib/scan-v2/ticket-view-model';
import {
  Icon,
  ScanText,
  ScanFrame,
  ScansPill,
  PillButton,
  type FrameInset,
} from './primitives';

interface ScreenCameraProps {
  captures: TicketVM[];
  scansLeft: number;
  scanning: boolean;
  onShutter: (base64: string, mimeType: string) => void;
  onUpload: () => void;
  onContinue: () => void;
  onClose: () => void;
}

const EMPTY_INSET: FrameInset = { top: 13, right: 9, bottom: 16, left: 9 };
const TRAY_INSET: FrameInset = { top: 11, right: 9, bottom: 41, left: 9 };

export function ScreenCamera({
  captures,
  scansLeft,
  scanning,
  onShutter,
  onUpload,
  onContinue,
  onClose,
}: ScreenCameraProps) {
  const camRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [bottomH, setBottomH] = useState(0);
  const [torch, setTorch] = useState(false);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);
  // Synchronous re-entrancy guard: `busy` is React state and two rapid taps can
  // both read it as false before the first setBusy flushes, double-firing the
  // shutter and wasting a (rate-limited) scan. The ref flips synchronously.
  const busyRef = useRef(false);

  const remaining = scansLeft;
  const readyCount = captures.filter((c) => c.status !== 'failed').length;

  // The frame's bottom inset must always clear the bottom-controls stack, which
  // grows with 2+ captures (tray height) — a fixed % collides with the live
  // preview. Derive it from the measured stack height so the frame's bottom edge
  // always sits a gap above the controls, at any capture count.
  const frameInset = useMemo<FrameInset>(() => {
    if (!captures.length) return EMPTY_INSET;
    if (!bottomH || !winH) return TRAY_INSET; // pre-measure fallback (first frame)
    const clearPx = s(18) + insets.bottom + bottomH + s(16); // stack offset + height + gap
    const bottomPct = Math.min(64, Math.max(TRAY_INSET.bottom, (clearPx / winH) * 100));
    return { top: 11, right: 9, bottom: bottomPct, left: 9 };
  }, [captures.length, bottomH, winH, insets.bottom]);

  const shoot = useCallback(async () => {
    if (busyRef.current || scanning || remaining <= 0) return;
    busyRef.current = true;
    setBusy(true);
    // 110ms white flash
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 60, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();
    try {
      const photo = await camRef.current?.takePictureAsync({ base64: true, quality: 0.8 });
      if (photo?.base64) {
        onShutter(photo.base64, 'image/jpeg');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [scanning, remaining, onShutter, flashAnim]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', overflow: 'hidden' }]}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />

      {/* scan frame + dim mask (hidden while analyzing) */}
      {!scanning && <ScanFrame sweep inset={frameInset} />}

      {/* white flash */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flashAnim }]}
      />

      {/* analyzing overlay */}
      {scanning && <AnalyzingOverlay />}

      {/* top bar: close + scans pill */}
      <View
        style={{
          position: 'absolute',
          top: s(54),
          left: s(16),
          right: s(16),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 4,
        }}
      >
        <Pressable
          onPress={onClose}
          style={{
            width: s(38),
            height: s(38),
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={s(19)} color="#fff" />
        </Pressable>
        <ScansPill left={remaining} />
      </View>

      {/* hint chip */}
      {!scanning && (
        <View style={{ position: 'absolute', top: '17%', left: 0, right: 0, alignItems: 'center', zIndex: 3 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(7),
              paddingVertical: s(7),
              paddingHorizontal: s(14),
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          >
            <Icon name="ticket" size={s(15)} color={ScanV2Accent.primary} />
            <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(13), lineHeight: s(16), color: 'rgba(255,255,255,0.85)' }}>
              Fit your ticket inside the frame
            </ScanText>
          </View>
        </View>
      )}

      {/* bottom controls — lifted above the home indicator now the tab bar is hidden */}
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setBottomH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
        }}
        style={{ position: 'absolute', bottom: s(18) + insets.bottom, left: 0, right: 0, zIndex: 5, gap: s(12) }}
      >
        {captures.length > 0 && <CaptureTray captures={captures} readyCount={readyCount} />}

        {captures.length > 0 && (
          <View style={{ paddingHorizontal: s(16) }}>
            <PillButton
              full
              iconRight="arrowR"
              label={`Review ${captures.length} ticket${captures.length === 1 ? '' : 's'}`}
              onPress={onContinue}
            />
          </View>
        )}

        {/* shutter row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: s(30),
          }}
        >
          <Pressable
            onPress={onUpload}
            style={{
              width: s(50),
              height: s(50),
              borderRadius: s(14),
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="image" size={s(22)} color="#fff" />
          </Pressable>

          {remaining > 0 ? (
            <Pressable
              onPress={shoot}
              disabled={busy || scanning}
              style={{ width: s(74), height: s(74), borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={[StyleSheet.absoluteFill, { borderRadius: 999, borderWidth: 4, borderColor: 'rgba(255,255,255,0.9)' }]} />
              <View
                style={{
                  width: s(58),
                  height: s(58),
                  borderRadius: 999,
                  backgroundColor: busy || scanning ? 'rgba(255,255,255,0.5)' : '#fff',
                  transform: [{ scale: busy || scanning ? 0.88 : 1 }],
                }}
              />
            </Pressable>
          ) : (
            <View style={{ width: s(74), height: s(74), alignItems: 'center', justifyContent: 'center' }}>
              <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(11), color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                No scans left
              </ScanText>
            </View>
          )}

          <Pressable
            onPress={() => setTorch((t) => !t)}
            style={{
              width: s(50),
              height: s(50),
              borderRadius: s(14),
              backgroundColor: torch ? ScanV2Accent.primary : 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              borderColor: torch ? ScanV2Accent.primary : 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="flash" size={s(22)} color={torch ? ScanV2Accent.on : '#fff'} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Analyzing overlay
// ============================================================================

function AnalyzingOverlay() {
  const spin = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center', gap: s(16), backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 6 },
      ]}
    >
      <Animated.View
        style={{
          width: s(54),
          height: s(54),
          borderRadius: 999,
          borderWidth: 3,
          borderColor: ScanV2Colors.line,
          borderTopColor: ScanV2Accent.primary,
          transform: [{ rotate }],
        }}
      />
      <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(15), lineHeight: s(18), color: '#fafafa' }}>
        Reading your ticket…
      </ScanText>
      <ScanText style={{ fontFamily: Fonts.mono.regular, fontSize: s(11), letterSpacing: 1, color: 'rgba(255,255,255,0.5)' }}>
        EXTRACTING DETAILS
      </ScanText>
    </View>
  );
}

// ============================================================================
// Collector-style capture tray
// ============================================================================

function CaptureTray({ captures, readyCount }: { captures: TicketVM[]; readyCount: number }) {
  return (
    <View
      style={{
        marginHorizontal: s(13),
        borderRadius: s(18),
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        overflow: 'hidden',
        padding: s(9),
      }}
    >
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,9,11,0.55)' }]} />

      {/* header */}
      <View style={{ paddingHorizontal: s(6), paddingTop: s(3), paddingBottom: s(8) }}>
        <ScanText style={{ fontFamily: Fonts.mono.medium, fontSize: s(11), letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>
          {captures.length} CAPTURED
        </ScanText>
      </View>

      {/* card list */}
      <ScrollView style={{ maxHeight: s(146) }} contentContainerStyle={{ gap: s(7) }} showsVerticalScrollIndicator={false}>
        {captures.map((c) => (
          <TrayRow key={c.id} ticket={c} />
        ))}
      </ScrollView>

      {/* footer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: s(6), paddingHorizontal: s(6), paddingTop: s(8), paddingBottom: s(2) }}>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(12.5), color: 'rgba(255,255,255,0.5)' }}>Ready to review</ScanText>
        <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(15), lineHeight: s(17), color: ScanV2Accent.primary }}>{readyCount}</ScanText>
      </View>
    </View>
  );
}

function TrayRow({ ticket }: { ticket: TicketVM }) {
  const failed = ticket.status === 'failed';
  const meta = failed
    ? "Couldn't read — review it"
    : [ticket.fields.date, ticket.fields.format].filter(Boolean).join(' · ') || ticket.fields.theater || 'Tap to add details';
  const posterUrl = ticket.movie ? getTMDBImageUrl(ticket.movie.posterPath, 'w92') : null;
  const conf = ticket.confidence;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(11),
        padding: s(8),
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: failed ? 'rgba(225,29,72,0.3)' : 'rgba(255,255,255,0.07)',
        borderRadius: s(13),
      }}
    >
      <View style={{ width: s(38), height: s(52), borderRadius: s(7), overflow: 'hidden', backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center' }}>
        {failed || !posterUrl ? (
          <Icon name="film" size={s(18)} color="rgba(255,255,255,0.3)" />
        ) : (
          <Image source={{ uri: posterUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ScanText
          numberOfLines={1}
          style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14.5), lineHeight: s(18), color: '#fafafa' }}
        >
          {failed ? 'Unreadable ticket' : ticket.movie?.title ?? 'Unknown movie'}
        </ScanText>
        <ScanText
          numberOfLines={1}
          style={{ fontFamily: Fonts.inter.regular, fontSize: s(12), lineHeight: s(15), color: failed ? ScanV2Accent.primary : 'rgba(255,255,255,0.5)', marginTop: s(2) }}
        >
          {meta}
        </ScanText>
      </View>
      {failed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), paddingVertical: s(5), paddingHorizontal: s(9), borderRadius: 999, backgroundColor: 'rgba(225,29,72,0.16)' }}>
          <Icon name="search" size={s(13)} color={ScanV2Accent.primary} />
          <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(12), color: ScanV2Accent.primary }}>Review</ScanText>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-end', paddingRight: s(3) }}>
          <ScanText style={{ fontFamily: Fonts.mono.bold, fontSize: s(15), lineHeight: s(15), color: conf >= 85 ? '#34d399' : '#fbbf24' }}>{conf}%</ScanText>
          <ScanText style={{ fontFamily: Fonts.mono.regular, fontSize: s(8.5), letterSpacing: 0.6, color: 'rgba(255,255,255,0.4)', marginTop: s(2) }}>MATCH</ScanText>
        </View>
      )}
    </View>
  );
}
