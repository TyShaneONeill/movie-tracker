/**
 * Ticket Scan v2 — `CompanionPicker`.
 *
 * Dark-only v2 people picker for the Edit Journey sheet's "Who was there?"
 * field. Modeled on `PickerOverlay`'s `MoviePicker` chrome (dark search field +
 * scrollable results) — NOT the theme-aware `FriendPickerModal` (which renders
 * light-on-dark). Rendered as an absolute overlay INSIDE the sheet's modal so it
 * never dismisses the parent sheet or loses its scroll position.
 *
 * Data: `useMutualFollows(userId)` → `Profile[]` (mutual = followers∩following),
 * filtered client-side by `full_name`/`username`. Already-selected names are
 * excluded so the live list shrinks as companions are added. Free-text manual
 * add ("Add '<query>'") emits the trimmed string; mutual-follow rows emit the
 * display name (`full_name || username`). `watched_with` stores names, no FK.
 *
 * Dark-only (built from `ScanV2Colors`/`ScanV2Accent`); text via `ScanText`,
 * sizes via `s()`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { Avatar } from '@/components/ui/avatar';
import { Icon, ScanText } from './primitives';

interface CompanionPickerProps {
  /** Current user id — seeds the mutual-follows query. */
  userId: string;
  /** Already-selected display names — excluded from results + dedupe guard. */
  alreadyAdded: string[];
  /** Emits the picked display name (mutual follow) or trimmed free-text. */
  onAdd: (displayName: string) => void;
  onClose: () => void;
}

export function CompanionPicker({ userId, alreadyAdded, onAdd, onClose }: CompanionPickerProps) {
  const insets = useSafeAreaInsets();
  const { mutualFollows, isLoading } = useMutualFollows(userId);
  const [query, setQuery] = useState('');

  // Lift the picker above the keyboard ourselves: on Android KeyboardAvoidingView
  // is a no-op without a behavior (and unreliable under edge-to-edge), so the
  // auto-focused search field would sit behind the keyboard. Measure the keyboard
  // and pad the flex-end container by its height.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const alreadyAddedLower = useMemo(
    () => new Set(alreadyAdded.map((n) => n.trim().toLowerCase())),
    [alreadyAdded],
  );

  const results = useMemo(() => {
    const available = mutualFollows.filter((p) => {
      const name = (p.full_name || p.username || '').toLowerCase();
      return name.length > 0 && !alreadyAddedLower.has(name);
    });
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (p) =>
        (p.full_name ?? '').toLowerCase().includes(q) ||
        (p.username ?? '').toLowerCase().includes(q),
    );
  }, [mutualFollows, alreadyAddedLower, query]);

  const trimmed = query.trim();
  const canManualAdd = trimmed.length > 0 && !alreadyAddedLower.has(trimmed.toLowerCase());

  // Keep the picker open after each add (companions are added in batches); the
  // results list shrinks live as `alreadyAdded` grows. Clear the query so the
  // next person is easy to find.
  const handlePick = (displayName: string) => {
    onAdd(displayName);
    setQuery('');
  };

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 40, justifyContent: 'flex-end', paddingBottom: kbHeight } as any}>
      {/* Strong scrim — reads as a single takeover over the sheet. */}
      <Pressable
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)' } as any}
        onPress={onClose}
      />

      {/* Gray "foot" pinned to the device bottom, BEHIND the sheet, so the dark
          scrim doesn't show through the modal's bottom-inset gap as a black bar
          (mirrors PickerOverlay). pointerEvents none so the gap still closes. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: s(150), backgroundColor: ScanV2Colors.surface } as any}
      />

      <View style={{ width: '100%' }}>
        <View
          style={{
            backgroundColor: ScanV2Colors.surface,
            borderTopLeftRadius: s(24),
            borderTopRightRadius: s(24),
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: ScanV2Colors.line,
            maxHeight: '80%',
            overflow: 'hidden',
          }}
        >
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(10) }}>
            <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: ScanV2Colors.text }}>
              Who was there?
            </ScanText>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: ScanV2Colors.field, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={s(16)} color={ScanV2Colors.sec} />
            </Pressable>
          </View>

          {/* search */}
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
              placeholder="Search people or type a name…"
              placeholderTextColor={ScanV2Colors.ter}
              autoFocus
              autoCorrect={false}
              allowFontScaling={false}
              style={{ flex: 1, color: ScanV2Colors.text, fontFamily: Fonts.inter.regular, fontSize: s(15), padding: 0 }}
            />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: s(16), paddingBottom: s(20) + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            {isLoading && (
              <View style={{ paddingVertical: s(20), alignItems: 'center' }}>
                <ActivityIndicator size="small" color={ScanV2Accent.primary} />
              </View>
            )}

            {/* manual add affordance */}
            {canManualAdd && (
              <Pressable
                onPress={() => handlePick(trimmed)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: s(12), paddingVertical: s(10), opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ width: s(40), height: s(40), borderRadius: 999, backgroundColor: ScanV2Accent.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={s(20)} color={ScanV2Accent.primary} />
                </View>
                <ScanText numberOfLines={1} style={{ flex: 1, fontFamily: Fonts.inter.semibold, fontSize: s(15), color: ScanV2Colors.text }}>
                  Add “{trimmed}”
                </ScanText>
              </Pressable>
            )}

            {/* mutual-follow rows */}
            {results.map((p) => {
              const name = p.full_name || p.username || 'Unknown';
              return (
                <Pressable
                  key={p.id}
                  onPress={() => handlePick(name)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: s(12), paddingVertical: s(10), opacity: pressed ? 0.7 : 1 })}
                >
                  <Avatar size={s(40)} userId={p.id} avatarUrl={p.avatar_url} updatedAt={p.updated_at} name={name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ScanText numberOfLines={1} style={{ fontFamily: Fonts.inter.semibold, fontSize: s(15), color: ScanV2Colors.text }}>
                      {name}
                    </ScanText>
                    {p.username ? (
                      <ScanText numberOfLines={1} style={{ fontFamily: Fonts.inter.regular, fontSize: s(12.5), color: ScanV2Colors.sec, marginTop: s(1) }}>
                        @{p.username}
                      </ScanText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {!isLoading && results.length === 0 && !canManualAdd && (
              <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13), color: ScanV2Colors.ter, textAlign: 'center', paddingVertical: s(20) }}>
                {mutualFollows.length === 0
                  ? 'Follow friends on PocketStubs to see them here'
                  : 'No matches — type a name to add'}
              </ScanText>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

export default CompanionPicker;
