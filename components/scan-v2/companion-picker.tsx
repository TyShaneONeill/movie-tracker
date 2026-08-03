/**
 * Ticket Scan v2 — `CompanionPicker`.
 *
 * Theme-aware v2 people picker for the Edit Journey sheet's "Who was there?"
 * field. Modeled on `PickerOverlay`'s `MoviePicker` chrome (dark search field +
 * scrollable results) — NOT the theme-aware `FriendPickerModal` (which renders
 * light-on-dark). Rendered as an absolute overlay INSIDE the sheet's modal so it
 * never dismisses the parent sheet or loses its scroll position.
 *
 * Data: `useMutualFollows(userId)` → `Profile[]` (mutual = followers∩following),
 * filtered client-side by `full_name`/`username`. Selected names stay in the
 * list carrying the selected treatment (accent border + soft fill + check,
 * matching `PickerOverlay`'s `RadioList`); tapping a selected row removes them.
 * Free-text manual add ("Add '<query>'") stores the trimmed string; mutual-follow
 * rows store the display name (`full_name || username`). Free-text companions are
 * not in `mutualFollows`, so they are appended as selected rows of their own —
 * otherwise they would be unremovable from here. `watched_with` stores names, no
 * FK.
 *
 * Selection is a DRAFT: seeded from `initialSelection` when the picker mounts
 * (mount == open — the parent renders it conditionally), edited locally, and
 * only handed to the parent via `onConfirm` (the ✓ in the header). The ✕ and
 * the scrim mean cancel — close and discard, the parent state was never
 * touched (#782 follow-up).
 *
 * Theme-aware (built from `useScanColors`/`ScanV2Accent`); text via `ScanText`,
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
  Platform,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { useScanColors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { hapticImpact, ImpactFeedbackStyle } from '@/lib/haptics';
import { Avatar } from '@/components/ui/avatar';
import { Icon, ScanText } from './primitives';

interface CompanionPickerProps {
  /** Current user id — seeds the mutual-follows query. */
  userId: string;
  /** Selection when the picker opens — the snapshot cancel reverts to. */
  initialSelection: string[];
  /** ✓ — emits the draft for the parent to apply; the parent then closes. */
  onConfirm: (displayNames: string[]) => void;
  /** ✕ / scrim — close discarding every change made in this picker session. */
  onCancel: () => void;
}

const norm = (n: string) => n.trim().toLowerCase();

export function CompanionPicker({ userId, initialSelection, onConfirm, onCancel }: CompanionPickerProps) {
  const c = useScanColors();
  const insets = useSafeAreaInsets();
  const { mutualFollows, isLoading } = useMutualFollows(userId);
  const [query, setQuery] = useState('');

  // Draft selection — the parent's companions are untouched until ✓, so ✕ and
  // the scrim revert by simply not emitting. The initializer runs on mount,
  // which is the moment the sheet opens, so it IS the opening snapshot.
  const [selected, setSelected] = useState<string[]>(() => [...initialSelection]);

  // Lift the content above the keyboard ourselves: on Android KeyboardAvoidingView
  // is a no-op without a behavior (and unreliable under edge-to-edge), so the
  // auto-focused search field would sit behind the keyboard.
  const kbHeight = useKeyboardHeight();

  const selectedLower = useMemo(() => new Set(selected.map(norm)), [selected]);

  // Selected people are NOT filtered out — a vanishing row reads as a no-op (#782).
  const results = useMemo(() => {
    const named = mutualFollows.filter((p) => (p.full_name || p.username || '').trim().length > 0);
    const q = query.trim().toLowerCase();
    if (!q) return named;
    return named.filter(
      (p) =>
        (p.full_name ?? '').toLowerCase().includes(q) ||
        (p.username ?? '').toLowerCase().includes(q),
    );
  }, [mutualFollows, query]);

  // Companions added as free text have no mutual-follow row to carry their
  // selected state, so give them one.
  //
  // Deduped by normalized name: `watched_with` can legitimately hold the same
  // name twice (the v1 editor's `handleFriendSelected` appends with no dedupe),
  // and two rows keyed `free:<name>` would collide. One row per distinct name;
  // toggling it clears every matching entry, which is what the single visible
  // row implies.
  const freeTextSelected = useMemo(() => {
    const known = new Set(
      mutualFollows.map((p) => norm(p.full_name || p.username || '')).filter((n) => n.length > 0),
    );
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    return selected.filter((n) => {
      const lower = norm(n);
      if (!lower || known.has(lower) || seen.has(lower)) return false;
      if (q.length > 0 && !lower.includes(q)) return false;
      seen.add(lower);
      return true;
    });
  }, [selected, mutualFollows, query]);

  const trimmed = query.trim();
  const canManualAdd = trimmed.length > 0 && !selectedLower.has(trimmed.toLowerCase());

  // Keep the picker open after each add (companions are added in batches). Clear
  // the query so the next person is easy to find; the row the user just tapped
  // stays on screen wearing the selected treatment. Trim on add + compare
  // normalized on both sides — `watched_with` can hold dirty v1-written names
  // (' Kelsie '), which must not slip past the dedupe.
  const handlePick = (displayName: string) => {
    const t = displayName.trim();
    if (!t) return;
    hapticImpact(ImpactFeedbackStyle.Light);
    setSelected((prev) => (prev.some((n) => norm(n) === norm(t)) ? prev : [...prev, t]));
    setQuery('');
  };

  // Deselect clears EVERY entry matching the name — the list shows one deduped
  // row per name, so a single tap must clear all of them.
  const handleToggle = (displayName: string) => {
    if (selectedLower.has(norm(displayName))) {
      hapticImpact(ImpactFeedbackStyle.Light);
      setSelected((prev) => prev.filter((n) => norm(n) !== norm(displayName)));
      return;
    }
    handlePick(displayName);
  };

  const handleConfirm = () => {
    hapticImpact(ImpactFeedbackStyle.Medium);
    onConfirm(selected);
  };

  const isEmpty =
    !isLoading && results.length === 0 && freeTextSelected.length === 0 && !canManualAdd;

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 40, justifyContent: 'flex-end' } as any}>
      {/* Strong scrim — reads as a single takeover over the sheet. Full-bleed
          (OUTSIDE any keyboard padding) so no strip of the parent sheet can
          ever peek through below it. Tapping it means cancel — "never mind". */}
      <Pressable
        testID="companion-picker-scrim"
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)' } as any}
        onPress={onCancel}
      />

      {/* The sheet hugs the DEVICE bottom; the keyboard is reserved as the
          sheet's own bottom padding rather than by lifting the whole sheet.
          If the measured height is ever off (iOS will-event timing while the
          keyboard animates, Android edge-to-edge over-reporting by the nav-bar
          inset) the exposed strip is sheet surface — not a hole showing the
          edit-journey screen behind (#782 follow-up). One reservation only:
          the keyboard when it's up, the home-indicator inset when it's down
          (the #740 padding-collapse pattern). This also replaces the old gray
          "foot" — the sheet itself now covers the modal's bottom-inset gap. */}
      <View
        testID="companion-picker-sheet"
        style={{
          backgroundColor: c.surface,
          borderTopLeftRadius: s(24),
          borderTopRightRadius: s(24),
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: c.line,
          maxHeight: '80%',
          overflow: 'hidden',
          paddingBottom: kbHeight > 0 ? kbHeight : insets.bottom,
        }}
      >
          {/* header — ✓ applies the draft, ✕ cancels (reverts to the opening
              snapshot by never emitting it) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(10) }}>
            <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: c.text }}>
              Who was there?
            </ScanText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
              <Pressable
                onPress={handleConfirm}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Done"
                style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: ScanV2Accent.soft, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="check" size={s(16)} color={ScanV2Accent.primary} stroke={2.6} />
              </Pressable>
              <Pressable
                onPress={onCancel}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: c.field, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="x" size={s(16)} color={c.sec} />
              </Pressable>
            </View>
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
              backgroundColor: c.field,
              borderWidth: 1,
              borderColor: c.fieldLine,
              borderRadius: s(12),
            }}
          >
            <Icon name="search" size={s(17)} color={c.sec} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search people or type a name…"
              placeholderTextColor={c.ter}
              autoFocus
              autoCorrect={false}
              allowFontScaling={false}
              style={{ flex: 1, color: c.text, fontFamily: Fonts.inter.regular, fontSize: s(15), padding: 0 }}
            />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            // flexShrink so the list SHRINKS to the space left inside the
            // sheet's maxHeight and becomes scrollable. Yoga's default is
            // flexShrink 0: the list laid out at full content height, the
            // sheet's overflow:hidden sliced the last row, and there was
            // nothing to scroll (#782 follow-up — the half-cut avatar).
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{
              // Rows carry the remaining s(10) themselves so a selected row's
              // fill bleeds past the gutter while its avatar stays at s(16).
              paddingHorizontal: s(6),
              gap: s(4),
              // Breathing room only — the keyboard / home-indicator inset is
              // reserved once, by the sheet's own paddingBottom.
              paddingBottom: s(20),
            }}
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
                style={({ pressed }) => ({ ...rowChrome(false, c), opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ width: s(40), height: s(40), borderRadius: 999, backgroundColor: ScanV2Accent.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={s(20)} color={ScanV2Accent.primary} />
                </View>
                <ScanText numberOfLines={1} style={{ flex: 1, fontFamily: Fonts.inter.semibold, fontSize: s(15), color: c.text }}>
                  Add “{trimmed}”
                </ScanText>
              </Pressable>
            )}

            {/* free-text companions — selected by definition */}
            {freeTextSelected.map((name) => (
              <PersonRow
                key={`free:${norm(name)}`}
                name={name}
                selected
                onPress={() => handleToggle(name)}
              />
            ))}

            {/* mutual-follow rows */}
            {results.map((p) => {
              const name = p.full_name || p.username || 'Unknown';
              return (
                <PersonRow
                  key={p.id}
                  name={name}
                  username={p.username}
                  userId={p.id}
                  avatarUrl={p.avatar_url}
                  updatedAt={p.updated_at}
                  selected={selectedLower.has(norm(name))}
                  onPress={() => handleToggle(name)}
                />
              );
            })}

            {isEmpty && (
              <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13), color: c.ter, textAlign: 'center', paddingVertical: s(20) }}>
                {mutualFollows.length === 0
                  ? 'Follow friends on PocketStubs to see them here'
                  : 'No matches — type a name to add'}
              </ScanText>
            )}
          </ScrollView>
      </View>
    </View>
  );
}

/**
 * Selected treatment lifted from `PickerOverlay`'s `RadioList` (accent border,
 * soft fill, trailing check). The border is always present — transparent when
 * off — so toggling a row doesn't shift the list.
 */
function rowChrome(selected: boolean, c: ReturnType<typeof useScanColors>) {
  return {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: s(12),
    paddingVertical: s(10),
    paddingHorizontal: s(10),
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: selected ? ScanV2Accent.primary : 'transparent',
    backgroundColor: selected ? ScanV2Accent.soft : 'transparent',
  };
}

function PersonRow({
  name,
  username,
  userId,
  avatarUrl,
  updatedAt,
  selected,
  onPress,
}: {
  name: string;
  username?: string | null;
  userId?: string | null;
  avatarUrl?: string | null;
  updatedAt?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useScanColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${name}, selected` : name}
      style={({ pressed }) => ({ ...rowChrome(selected, c), opacity: pressed ? 0.7 : 1 })}
    >
      <Avatar size={s(40)} userId={userId} avatarUrl={avatarUrl} updatedAt={updatedAt} name={name} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <ScanText numberOfLines={1} style={{ fontFamily: Fonts.inter.semibold, fontSize: s(15), color: selected ? ScanV2Accent.primary : c.text }}>
          {name}
        </ScanText>
        {username ? (
          <ScanText numberOfLines={1} style={{ fontFamily: Fonts.inter.regular, fontSize: s(12.5), color: c.sec, marginTop: s(1) }}>
            @{username}
          </ScanText>
        ) : null}
      </View>
      {selected && <Icon name="check" size={s(18)} color={ScanV2Accent.primary} stroke={2.6} />}
    </Pressable>
  );
}

// ============================================================================
// Keyboard height — same listener pair as EditSheet/EditJourneySheet/FirstTake
// ============================================================================

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setHeight(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  return height;
}

export default CompanionPicker;
