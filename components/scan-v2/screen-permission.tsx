/**
 * Ticket Scan v2 — `ScreenPermission`.
 *
 * Real camera-denied state. "Open Settings" deep-links to the OS settings;
 * "Upload a photo" falls back to the gallery scan path.
 */

import React from 'react';
import { View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useScanColors } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { Icon, ScanText, PillButton, TopBar } from './primitives';

interface ScreenPermissionProps {
  onOpenSettings: () => void;
  onUpload: () => void;
  onBack: () => void;
}

export function ScreenPermission({ onOpenSettings, onUpload, onBack }: ScreenPermissionProps) {
  const c = useScanColors();
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: c.bg } as any}>
      <TopBar onBack={onBack} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(36), gap: s(8) }}>
        <View
          style={{
            width: s(76),
            height: s(76),
            borderRadius: s(22),
            backgroundColor: c.field,
            borderWidth: 1,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: s(10),
          }}
        >
          <Icon name="camera" size={s(34)} color={c.sec} />
        </View>
        <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(22), lineHeight: s(26), color: c.text, textAlign: 'center' }}>
          Camera access needed
        </ScanText>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), lineHeight: s(21), color: c.sec, textAlign: 'center', maxWidth: s(280) }}>
          To scan a ticket, let PocketStubs use your camera. You can still add a photo from your library.
        </ScanText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: s(10), marginTop: s(18) }}>
          <PillButton icon="gear" label="Open Settings" onPress={onOpenSettings} />
          <PillButton kind="ghost" icon="image" label="Upload a photo" onPress={onUpload} />
        </View>
      </View>
    </View>
  );
}
