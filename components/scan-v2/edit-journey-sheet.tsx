/**
 * Ticket Scan v2 — `EditJourneySheet` (Edit Journey).
 *
 * Dark-only v2 bottom sheet opened from the journey card's edit pencil (behind
 * `ticket_scan_v2`), replacing the v1 `/journey/edit/[id]` route for the
 * subset of fields that map to a single `user_movies` row: tagline, notes,
 * date, time, location, seat, format, auditorium, ticket price, ticket id, and
 * companions. Photos / rating / "first time" / AI-poster delete are deferred.
 *
 * Operates on a `UserMovie`, builds a `JourneyUpdate` patch, and emits it via
 * `onSave(patch)` — the screen feeds that into the SAME optimistic
 * `updateJourney` mutation v1 uses (cache keyed by `tmdb_id`). Normalization
 * mirrors v1's `buildFormData` exactly (`trim()||null`, LOWERCASE `watch_format`
 * enum, `"HH:MM"` 24h `watch_time`, ISO date-only `watched_at` preserving the
 * v1 date/time split, `watched_with` = deduped display-name array).
 *
 * Chrome + keyboard avoidance copied from `EditSheet` (the ProcessedTicket
 * sibling — patterns, not imports). Date/Time tap targets open the shared
 * `PickerOverlay`; Format opens a journey-specific radio overlay (the journey
 * format enum differs from PickerOverlay's ticket `FORMATS`); Companions open
 * the dark `CompanionPicker`. All overlays render INSIDE this sheet's modal so
 * they never dismiss it.
 *
 * Dark-only (built from `ScanV2Colors`/`ScanV2Accent`); text via `ScanText`,
 * sizes via `s()`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Keyboard,
  Dimensions,
  type KeyboardEvent,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { hapticImpact, ImpactFeedbackStyle } from '@/lib/haptics';
import { useAuth } from '@/hooks/use-auth';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import type { UserMovie, JourneyUpdate, WatchFormat } from '@/lib/database.types';
import { Avatar } from '@/components/ui/avatar';
import { Icon, ScanText, PillButton, type ScanIconName } from './primitives';
import { PickerOverlay } from './picker-overlay';
import { parseTimeLabel } from './time-wheel';
import { CompanionPicker } from './companion-picker';

// Journey watch_format options (display labels). Lowercased on save → the DB
// `WatchFormat` enum (`standard|imax|dolby|3d|4k|screenx|4dx`). Distinct from
// PickerOverlay's ticket `FORMATS` (Dolby Cinema/RPX/70mm), which don't map to
// the enum — so the format picker uses THIS list, not `PickerOverlay 'format'`.
const FORMAT_OPTIONS = ['Standard', 'IMAX', 'Dolby', '3D', '4K', 'ScreenX', '4DX'] as const;
type FormatDisplay = (typeof FORMAT_OPTIONS)[number];

type PickerKind = 'date' | 'time' | 'format';

interface EditJourneySheetProps {
  journey: UserMovie;
  onClose: () => void;
  onSave: (patch: JourneyUpdate) => void;
}

// ---------------------------------------------------------------------------
// Seed / normalization helpers (mirror v1 buildFormData two-field date/time
// split + lowercase enum)
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Full ISO timestamp → LOCAL `YYYY-MM-DD` (what the date grid expects). */
function toLocalDateISO(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return toLocalDateISO(null);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local `YYYY-MM-DD` → ISO at LOCAL MIDNIGHT (date-only; clock lives in watch_time). */
function localMidnightISO(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return new Date().toISOString();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
}

/** DB `"HH:MM"` 24h → wheel label `"7:30 PM"`. */
function toTimeLabel(hhmm: string | null): string {
  if (!hhmm) return '7:30 PM';
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return '7:30 PM';
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return '7:30 PM';
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(min)} ${ap}`;
}

/** Wheel label `"7:30 PM"` → DB `"HH:MM"` 24h zero-padded. */
function toWatchTime(label: string): string {
  const t = parseTimeLabel(label);
  let h24 = t.h % 12;
  if (t.ap === 'PM') h24 += 12;
  return `${pad2(h24)}:${pad2(t.min)}`;
}

function toDisplayFormat(db: string | null): FormatDisplay {
  if (!db) return 'Standard';
  return FORMAT_OPTIONS.find((f) => f.toLowerCase() === db.toLowerCase()) ?? 'Standard';
}

/** Local `YYYY-MM-DD` → readable label, e.g. "Mon, Jun 15, 2026". */
function formatDisplayDate(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Dedupe names by lowercased value, preserving first display form + order. */
function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = n.trim();
    const key = t.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Price input mask: strip non-`[0-9.]`, keep ≤1 dot, ≤2 decimals. */
function maskPrice(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  if (dot !== -1) {
    const intPart = v.slice(0, dot);
    const decPart = v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    v = `${intPart}.${decPart}`;
  }
  return v;
}

export function EditJourneySheet({ journey, onClose, onSave }: EditJourneySheetProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { mutualFollows } = useMutualFollows(user?.id ?? '');

  const [tagline, setTagline] = useState(journey.journey_tagline ?? '');
  const [notes, setNotes] = useState(journey.journey_notes ?? '');
  const [dateISO, setDateISO] = useState(() => toLocalDateISO(journey.watched_at));
  const [timeLabel, setTimeLabel] = useState(() => toTimeLabel(journey.watch_time));
  const [location, setLocation] = useState(journey.location_name ?? '');
  const [seat, setSeat] = useState(journey.seat_location ?? '');
  const [format, setFormat] = useState<FormatDisplay>(() => toDisplayFormat(journey.watch_format));
  const [auditorium, setAuditorium] = useState(journey.auditorium ?? '');
  const [price, setPrice] = useState(journey.ticket_price != null ? String(journey.ticket_price) : '');
  const [ticketId, setTicketId] = useState(journey.ticket_id ?? '');
  const [companions, setCompanions] = useState<string[]>(journey.watched_with ?? []);

  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [showCompanions, setShowCompanions] = useState(false);

  const kbHeight = useKeyboardHeight();

  // name -> avatar lookup for the selected-companion chips (same source as the
  // v1 edit screen / journey-screen friendAvatarMap).
  const friendAvatarMap = useMemo(() => {
    const map = new Map<string, { userId: string; avatarUrl: string | null; updatedAt: string | null }>();
    for (const p of mutualFollows) {
      const name = (p.full_name || p.username || '').toLowerCase();
      if (name) map.set(name, { userId: p.id, avatarUrl: p.avatar_url, updatedAt: p.updated_at });
    }
    return map;
  }, [mutualFollows]);

  // Opening any overlay must dismiss the keyboard first — otherwise it pops up
  // BEHIND the still-open keyboard.
  const openPicker = useCallback((kind: PickerKind) => {
    Keyboard.dismiss();
    setPicker(kind);
  }, []);

  const openCompanions = useCallback(() => {
    Keyboard.dismiss();
    setShowCompanions(true);
  }, []);

  // Keyboard avoidance: scroll the focused field above the keyboard.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const focusedInput = useRef<TextInput | null>(null);
  const kbHeightRef = useRef(0);

  const ensureVisible = useCallback((input: TextInput | null) => {
    const sv = scrollRef.current;
    if (!sv || !input) return;
    requestAnimationFrame(() => {
      input.measureInWindow((_x, y, _w, h) => {
        if (kbHeightRef.current <= 0) return;
        const kbTop = Dimensions.get('window').height - kbHeightRef.current;
        const overlap = y + h + s(44) - kbTop;
        if (overlap > 0) {
          sv.scrollTo({ y: scrollY.current + overlap, animated: true });
        }
      });
    });
  }, []);

  useEffect(() => {
    kbHeightRef.current = kbHeight;
    if (kbHeight > 0) ensureVisible(focusedInput.current);
  }, [kbHeight, ensureVisible]);

  const handleInputFocus = useCallback(
    (input: TextInput | null) => {
      focusedInput.current = input;
      ensureVisible(input);
    },
    [ensureVisible],
  );

  const addCompanion = useCallback((name: string) => {
    const t = name.trim();
    if (!t) return;
    setCompanions((prev) =>
      prev.some((n) => n.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t],
    );
  }, []);

  const removeCompanion = useCallback((index: number) => {
    setCompanions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    const deduped = dedupeNames(companions);
    const patch: JourneyUpdate = {
      journey_tagline: tagline.trim() || null,
      journey_notes: notes.trim() || null,
      watched_at: localMidnightISO(dateISO),
      watch_time: toWatchTime(timeLabel),
      location_name: location.trim() || null,
      seat_location: seat.trim() || null,
      watch_format: format.toLowerCase() as WatchFormat,
      auditorium: auditorium.trim() || null,
      ticket_price: Number.isFinite(parseFloat(price)) ? parseFloat(price) : null,
      ticket_id: ticketId.trim() || null,
      watched_with: deduped.length > 0 ? deduped : null,
    };
    hapticImpact(ImpactFeedbackStyle.Medium);
    onSave(patch);
  }, [tagline, notes, dateISO, timeLabel, location, seat, format, auditorium, price, ticketId, companions, onSave]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' } as any} onPress={onClose} />

        <View
          style={{
            backgroundColor: ScanV2Colors.surface,
            borderTopLeftRadius: s(26),
            borderTopRightRadius: s(26),
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: ScanV2Colors.line,
            maxHeight: '94%',
            overflow: 'hidden',
          }}
        >
          {/* grabber */}
          <View style={{ alignItems: 'center', paddingTop: s(10) }}>
            <View style={{ width: s(38), height: s(5), borderRadius: 999, backgroundColor: ScanV2Colors.lineHi }} />
          </View>

          {/* header: Cancel / Edit journey / Save */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8), paddingHorizontal: s(16), paddingTop: s(8), paddingBottom: s(10) }}>
            <Pressable onPress={onClose} hitSlop={8} style={{ minWidth: s(54) }}>
              <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(15), color: ScanV2Colors.sec }}>Cancel</ScanText>
            </Pressable>
            <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: ScanV2Colors.text }}>Edit journey</ScanText>
            <Pressable onPress={handleSave} hitSlop={8} style={{ minWidth: s(54), alignItems: 'flex-end' }}>
              <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(15), color: ScanV2Accent.primary }}>Save</ScanText>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: s(16), paddingBottom: s(40) }}
            showsVerticalScrollIndicator={false}
          >
            {/* Your journey */}
            <SectionCard title="Your journey">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(12) }}>
                <EditField
                  label="Tagline"
                  value={tagline}
                  onChangeText={setTagline}
                  onInputFocus={handleInputFocus}
                  placeholder="A line about this viewing"
                  maxLength={50}
                  fullWidth
                />
                <EditField
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  onInputFocus={handleInputFocus}
                  placeholder="Thoughts, moments, who you went with…"
                  maxLength={500}
                  multiline
                  fullWidth
                />
              </View>
            </SectionCard>

            {/* When & where */}
            <SectionCard title="When & where">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(12) }}>
                <EditField label="Date" value={formatDisplayDate(dateISO)} onTap={() => openPicker('date')} picker="calendar" placeholder="Pick date" />
                <EditField label="Time" value={timeLabel} onTap={() => openPicker('time')} picker="clock" placeholder="Pick time" />
                <EditField label="Cinema / location" value={location} onChangeText={setLocation} onInputFocus={handleInputFocus} placeholder="Cinema or place" fullWidth />
                <EditField label="Seat" value={seat} onChangeText={setSeat} onInputFocus={handleInputFocus} placeholder="e.g. F12" />
                <EditField label="Auditorium" value={auditorium} onChangeText={setAuditorium} onInputFocus={handleInputFocus} placeholder="e.g. 8" />
                <EditField label="Format" value={format} onTap={() => openPicker('format')} picker="film" placeholder="Pick format" fullWidth />
              </View>
            </SectionCard>

            {/* Ticket */}
            <SectionCard title="Ticket">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(12) }}>
                <EditField
                  label="Ticket price"
                  value={price}
                  onChangeText={(v) => setPrice(maskPrice(v))}
                  onInputFocus={handleInputFocus}
                  placeholder="0.00"
                  prefix="$"
                  keyboardType="decimal-pad"
                />
                <EditField
                  label="Ticket ID"
                  value={ticketId}
                  onChangeText={setTicketId}
                  onInputFocus={handleInputFocus}
                  placeholder="Ticket #"
                  autoCapitalize="characters"
                />
              </View>
            </SectionCard>

            {/* Who was there */}
            <SectionCard title="Who was there">
              {companions.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8), marginBottom: s(10) }}>
                  {companions.map((name, i) => {
                    const a = friendAvatarMap.get(name.toLowerCase());
                    return (
                      <View
                        key={`${name}-${i}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s(7),
                          paddingVertical: s(5),
                          paddingLeft: s(5),
                          paddingRight: s(9),
                          borderRadius: 999,
                          backgroundColor: ScanV2Colors.field,
                          borderWidth: 1,
                          borderColor: ScanV2Colors.fieldLine,
                        }}
                      >
                        <Avatar size={s(20)} userId={a?.userId} avatarUrl={a?.avatarUrl} updatedAt={a?.updatedAt} name={name} />
                        <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(13), color: ScanV2Colors.text }}>{name}</ScanText>
                        <Pressable onPress={() => removeCompanion(i)} hitSlop={6}>
                          <Icon name="x" size={s(13)} color={ScanV2Colors.sec} stroke={2.4} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
              <PillButton kind="soft" icon="plus" label="Add person" onPress={openCompanions} />
            </SectionCard>

            {/* bottom spacer — reserve the live keyboard height (or the home
                indicator inset) so the focused field can scroll above it. */}
            <View style={{ height: (kbHeight > 0 ? kbHeight : insets.bottom) + s(8) }} />
          </ScrollView>
        </View>

        {/* Date / Time — shared PickerOverlay (inside the modal). */}
        {(picker === 'date' || picker === 'time') && (
          <PickerOverlay
            kind={picker}
            currentValue={picker === 'date' ? dateISO : timeLabel}
            onPickValue={(value) => {
              if (picker === 'date') setDateISO(value);
              else setTimeLabel(value);
              setPicker(null);
            }}
            onPickMovie={() => {}}
            onClose={() => setPicker(null)}
          />
        )}

        {/* Format — journey-specific radio overlay (enum differs from ticket FORMATS). */}
        {picker === 'format' && (
          <RadioPickerOverlay
            title="Format"
            items={FORMAT_OPTIONS as unknown as string[]}
            current={format}
            onPick={(value) => {
              setFormat(value as FormatDisplay);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        )}

        {/* Companions — dark v2 people picker (inside the modal). */}
        {showCompanions && (
          <CompanionPicker
            userId={user?.id ?? ''}
            alreadyAdded={companions}
            onAdd={addCompanion}
            onClose={() => setShowCompanions(false)}
          />
        )}
      </View>
    </Modal>
  );
}

// ============================================================================
// Section card + labelled field (copied/adapted from EditSheet)
// ============================================================================

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: ScanV2Colors.card,
        borderRadius: s(16),
        borderWidth: 1,
        borderColor: ScanV2Colors.line,
        padding: s(14),
        marginTop: s(12),
      }}
    >
      <ScanText
        style={{
          fontFamily: Fonts.mono.medium,
          fontSize: s(11),
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: ScanV2Colors.ter,
          marginBottom: s(10),
        }}
      >
        {title}
      </ScanText>
      {children}
    </View>
  );
}

interface EditFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  picker?: ScanIconName;
  prefix?: string;
  fullWidth?: boolean;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  onChangeText?: (v: string) => void;
  onTap?: () => void;
  onInputFocus?: (input: TextInput | null) => void;
}

function EditField({
  label,
  value,
  placeholder,
  picker,
  prefix,
  fullWidth,
  multiline,
  maxLength,
  keyboardType,
  autoCapitalize,
  onChangeText,
  onTap,
  onInputFocus,
}: EditFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const boxStyle = {
    minHeight: multiline ? s(76) : s(42),
    flexDirection: 'row' as const,
    alignItems: multiline ? ('flex-start' as const) : ('center' as const),
    gap: s(8),
    paddingVertical: s(8),
    paddingHorizontal: s(11),
    backgroundColor: ScanV2Colors.field,
    borderWidth: 1,
    borderColor: ScanV2Colors.fieldLine,
    borderRadius: s(11),
  };
  const leadingIcon = picker ? <Icon name={picker} size={s(15)} color={ScanV2Colors.sec} /> : null;

  return (
    <View style={{ flex: 1, minWidth: fullWidth ? '100%' : s(120) }}>
      <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(12), lineHeight: s(15), color: ScanV2Colors.sec, marginBottom: s(5) }}>{label}</ScanText>
      {onTap ? (
        <Pressable onPress={onTap} style={boxStyle}>
          {leadingIcon}
          <ScanText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ flex: 1, fontFamily: Fonts.inter.semibold, fontSize: s(15), lineHeight: s(19), color: value ? ScanV2Colors.text : ScanV2Colors.ter }}
          >
            {value || placeholder}
          </ScanText>
          <Icon name="chevD" size={s(15)} color={ScanV2Colors.ter} />
        </Pressable>
      ) : (
        <View style={boxStyle}>
          {leadingIcon}
          {prefix ? (
            <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(15), lineHeight: s(19), color: value ? ScanV2Colors.text : ScanV2Colors.ter }}>{prefix}</ScanText>
          ) : null}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => onInputFocus?.(inputRef.current)}
            placeholder={placeholder}
            placeholderTextColor={ScanV2Colors.ter}
            allowFontScaling={false}
            multiline={multiline}
            maxLength={maxLength}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            style={{
              flex: 1,
              padding: 0,
              color: ScanV2Colors.text,
              fontFamily: Fonts.inter.semibold,
              fontSize: s(15),
              minHeight: multiline ? s(60) : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
            }}
          />
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Journey format radio overlay (single-choice; commit on tap). Mirrors the
// PickerOverlay radio chrome — needed because the journey watch_format enum
// differs from PickerOverlay's hardcoded ticket FORMATS.
// ============================================================================

function RadioPickerOverlay({
  title,
  items,
  current,
  onPick,
  onClose,
}: {
  title: string;
  items: string[];
  current?: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bodyBottom = s(20) + insets.bottom + s(16);

  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 40, justifyContent: 'flex-end' } as any}>
      <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)' } as any} onPress={onClose} />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: s(150), backgroundColor: ScanV2Colors.surface } as any}
      />
      <View
        style={{
          backgroundColor: ScanV2Colors.surface,
          borderTopLeftRadius: s(24),
          borderTopRightRadius: s(24),
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: ScanV2Colors.line,
          maxHeight: '90%',
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(10) }}>
          <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: ScanV2Colors.text }}>{title}</ScanText>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: ScanV2Colors.field, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={s(16)} color={ScanV2Colors.sec} />
          </Pressable>
        </View>

        <View style={{ flexShrink: 1, paddingHorizontal: s(16), paddingTop: s(2), paddingBottom: bodyBottom }}>
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
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Keyboard height (drives the bottom spacer + scroll-into-view)
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

export default EditJourneySheet;
