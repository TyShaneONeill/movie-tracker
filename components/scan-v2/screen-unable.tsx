/**
 * Ticket Scan v2 — `ScreenUnable`.
 *
 * Couldn't-read empty state with two variants by scans-left:
 *   - scans left  -> "Try again" (primary) + "Add movie by hand" (ghost) + count.
 *   - no scans    -> only "Add movie by hand" (primary) + out-of-scans copy.
 */

import React from 'react';
import { View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useScanColors } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { Icon, ScanText, ScansPill, PillButton, TopBar } from './primitives';

interface ScreenUnableProps {
  scansLeft: number;
  onRetry: () => void;
  onManual: () => void;
  onBack: () => void;
}

export function ScreenUnable({ scansLeft, onRetry, onManual, onBack }: ScreenUnableProps) {
  const c = useScanColors();
  const none = scansLeft <= 0;
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: c.bg } as any}>
      <TopBar onBack={onBack} title="Review" sub="No tickets read" right={<ScansPill left={scansLeft} />} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(32), gap: s(8) }}>
        <View
          style={{
            width: s(72),
            height: s(72),
            borderRadius: s(20),
            backgroundColor: c.field,
            borderWidth: 1,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: s(8),
          }}
        >
          <Icon name="ticket" size={s(32)} color={c.ter} />
        </View>
        <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(21), lineHeight: s(25), color: c.text, textAlign: 'center' }}>
          {"Couldn't read that ticket"}
        </ScanText>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), lineHeight: s(21), color: c.sec, textAlign: 'center', maxWidth: s(290) }}>
          {none
            ? "You're out of scans for today. You can still add this movie by hand — it's unlimited."
            : 'Try again with the ticket flat, well-lit, and text in focus.'}
        </ScanText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: s(10), marginTop: s(18) }}>
          {!none && <PillButton icon="camera" label="Try again" onPress={onRetry} />}
          <PillButton kind={none ? 'primary' : 'ghost'} icon="search" label="Add movie by hand" onPress={onManual} />
        </View>
        {!none && (
          <ScanText style={{ fontFamily: Fonts.mono.regular, fontSize: s(11), letterSpacing: 0.5, color: c.ter, marginTop: s(6) }}>
            {scansLeft} SCAN{scansLeft === 1 ? '' : 'S'} LEFT TODAY
          </ScanText>
        )}
      </View>
    </View>
  );
}
