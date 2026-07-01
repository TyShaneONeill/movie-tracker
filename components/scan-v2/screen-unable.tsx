/**
 * Ticket Scan v2 — `ScreenUnable`.
 *
 * Nothing-read empty state with variants by reason and scans-left:
 *   - unreadable + scans left -> "Couldn't read that ticket" + Try again + count.
 *   - service_down            -> "Scanning is temporarily down" — our outage, not
 *                                the user's photo; their scan was refunded, so the
 *                                copy says so instead of inviting doomed retries.
 *   - no scans                -> only "Add movie by hand" (primary) + out-of-scans copy.
 */

import React from 'react';
import { View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useScanColors } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { Icon, ScanText, ScansPill, PillButton, TopBar } from './primitives';

interface ScreenUnableProps {
  scansLeft: number;
  reason?: 'unreadable' | 'service_down';
  onRetry: () => void;
  onManual: () => void;
  onBack: () => void;
}

export function ScreenUnable({ scansLeft, reason = 'unreadable', onRetry, onManual, onBack }: ScreenUnableProps) {
  const c = useScanColors();
  const none = scansLeft <= 0;
  const down = reason === 'service_down';

  const title = down ? 'Scanning is temporarily down' : "Couldn't read that ticket";
  const body = down
    ? "Something went wrong on our end — not your photo. Your scan wasn't used. Try again in a few minutes, or add the movie by hand."
    : none
      ? "You're out of scans for today. You can still add this movie by hand — it's unlimited."
      : 'Try again with the ticket flat, well-lit, and text in focus.';

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
          <Icon name={down ? 'warn' : 'ticket'} size={s(32)} color={c.ter} />
        </View>
        <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(21), lineHeight: s(25), color: c.text, textAlign: 'center' }}>
          {title}
        </ScanText>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), lineHeight: s(21), color: c.sec, textAlign: 'center', maxWidth: s(290) }}>
          {body}
        </ScanText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: s(10), marginTop: s(18) }}>
          {!none && <PillButton icon="camera" label="Try again" nowrap onPress={onRetry} />}
          <PillButton kind={none ? 'primary' : 'ghost'} icon="search" label="Add movie by hand" nowrap onPress={onManual} />
        </View>
        {!none && !down && (
          <ScanText style={{ fontFamily: Fonts.mono.regular, fontSize: s(11), letterSpacing: 0.5, color: c.ter, marginTop: s(6) }}>
            {scansLeft} SCAN{scansLeft === 1 ? '' : 'S'} LEFT TODAY
          </ScanText>
        )}
        {!none && down && (
          <ScanText style={{ fontFamily: Fonts.mono.regular, fontSize: s(11), letterSpacing: 0.5, color: c.ter, marginTop: s(6) }}>
            SCAN NOT USED · {scansLeft} LEFT TODAY
          </ScanText>
        )}
      </View>
    </View>
  );
}
