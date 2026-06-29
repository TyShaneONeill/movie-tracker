/**
 * Ticket Scan v2 — `EditSheet` (Edit Ticket).
 *
 * Native recreation of the prototype's `EditSheet`: a bottom sheet (max 92% h,
 * radius-26 top, grabber) with a Cancel / "Edit ticket" / Save header and three
 * card sections — Movie (poster + confidence pill + Change), From your ticket
 * (Theater / Date / Time / Rated), and a "More detail" group revealed by a
 * dashed "Add auditorium, row, seat…" affordance (Auditorium / Row / Seat /
 * Price + Format / Ticket type). The `SHOW_UNTRACKED` section stays hidden.
 *
 * Tap targets open the stacked `PickerOverlay` (movie search / radio / date /
 * time dial), which renders INSIDE this sheet's modal so it never dismisses the
 * sheet or loses its scroll position. Save folds the form back into the
 * underlying `ProcessedTicket` (`applyTicketEdits`) and a movie change clears the
 * block-on-unknown (failed/review → matched).
 *
 * Dark-only (built from `ScanV2Colors`/`ScanV2Accent`, never the theme-aware
 * sheet/icon components); text via `ScanText`, sizes via `s()`.
 *
 * Keyboard avoidance (both platforms, RN primitives only): the body is a
 * scrollable ScrollView with a bottom spacer equal to the live keyboard height,
 * and on `TextInput` focus the focused field is measured (`measureInWindow`) and
 * scrolled to sit just above the keyboard. Re-runs when the keyboard height
 * settles (Android raises it after focus). Taps persist
 * (`keyboardShouldPersistTaps="handled"`) and tapping empty space / dragging
 * dismisses the keyboard.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl, type TMDBMovie } from '@/lib/tmdb.types';
import type { ProcessedTicket } from '@/lib/ticket-processor';
import {
  seedEditForm,
  applyTicketEdits,
  formatEditDate,
  type TicketEditForm,
  type TicketVM,
} from '@/lib/scan-v2/ticket-view-model';
import { Icon, ScanText, PillButton, type ScanIconName } from './primitives';
import { PickerOverlay, type PickerKind } from './picker-overlay';

// "Also on your ticket — not tracked" section: off for now (revisit later).
const SHOW_UNTRACKED = false;

interface OptionalField {
  key: keyof TicketEditForm;
  label: string;
  placeholder?: string;
  /** When set, the field is a picker tap target instead of a text input. */
  tap?: PickerKind;
  icon?: ScanIconName;
}

const OPTIONAL_FIELDS: OptionalField[] = [
  { key: 'auditorium', label: 'Auditorium', placeholder: 'e.g. 8' },
  { key: 'row', label: 'Row', placeholder: 'F' },
  { key: 'seat', label: 'Seat', placeholder: '12' },
  { key: 'price', label: 'Price', placeholder: '$0.00' },
  { key: 'format', label: 'Format', tap: 'format', icon: 'film', placeholder: 'Pick format' },
  { key: 'type', label: 'Ticket type', tap: 'type', icon: 'ticket', placeholder: 'Pick type' },
];

interface EditSheetProps {
  vm: TicketVM;
  ticket: ProcessedTicket;
  onClose: () => void;
  onSave: (updated: ProcessedTicket) => void;
}

export function EditSheet({ vm, ticket, onClose, onSave }: EditSheetProps) {
  const [form, setForm] = useState<TicketEditForm>(() => seedEditForm(ticket));
  const [movie, setMovie] = useState<TMDBMovie | null>(ticket.tmdbMatch?.movie ?? null);
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const kbHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();

  // Opening any picker must dismiss the keyboard first — otherwise the overlay
  // pops up BEHIND the still-open keyboard and can't be interacted with.
  const openPicker = useCallback((kind: PickerKind) => {
    Keyboard.dismiss();
    setPicker(kind);
  }, []);

  // Keyboard avoidance: scroll the focused field above the keyboard.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const focusedInput = useRef<TextInput | null>(null);
  const kbHeightRef = useRef(0);

  const ensureVisible = useCallback((input: TextInput | null) => {
    const sv = scrollRef.current;
    if (!sv || !input) return;
    // rAF so the measure happens after the keyboard frame / layout settles.
    requestAnimationFrame(() => {
      input.measureInWindow((_x, y, _w, h) => {
        if (kbHeightRef.current <= 0) return;
        const kbTop = Dimensions.get('window').height - kbHeightRef.current;
        // Extra margin so the FULL text box clears the keyboard (not flush).
        const overlap = y + h + s(44) - kbTop;
        if (overlap > 0) {
          sv.scrollTo({ y: scrollY.current + overlap, animated: true });
        }
      });
    });
  }, []);

  // When the keyboard height settles (Android raises it after focus), re-run
  // the scroll-into-view for whatever field is currently focused.
  useEffect(() => {
    kbHeightRef.current = kbHeight;
    if (kbHeight > 0) ensureVisible(focusedInput.current);
  }, [kbHeight, ensureVisible]);

  const handleInputFocus = useCallback(
    (input: TextInput | null) => {
      focusedInput.current = input;
      ensureVisible(input);
    },
    [ensureVisible]
  );

  const set = (key: keyof TicketEditForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const changedMovie = movie != null && movie.id !== ticket.tmdbMatch?.movie.id;
  const confident = changedMovie ? true : vm.status === 'matched';
  const confidence = changedMovie ? 100 : vm.confidence;
  const posterUrl = movie ? getTMDBImageUrl(movie.poster_path, 'w185') : null;

  const hasValue = (o: OptionalField) => !!form[o.key];
  const missing = OPTIONAL_FIELDS.filter((o) => !hasValue(o));
  const visibleOptional = OPTIONAL_FIELDS.filter((o) => hasValue(o) || showAdd);
  const showMoreDetail = visibleOptional.length > 0;

  const handleSave = () => onSave(applyTicketEdits(ticket, form, movie));

  const pickerValue = (): string | undefined => {
    switch (picker) {
      case 'format':
        return form.format;
      case 'rated':
        return form.rated;
      case 'type':
        return form.type;
      case 'time':
        return form.time;
      case 'date':
        return form.dateISO;
      default:
        return undefined;
    }
  };

  const handlePickValue = (value: string) => {
    switch (picker) {
      case 'format':
        set('format', value);
        break;
      case 'rated':
        set('rated', value);
        break;
      case 'type':
        set('type', value);
        break;
      case 'time':
        set('time', value);
        break;
      case 'date':
        set('dateISO', value);
        break;
    }
    setPicker(null);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
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

          {/* header: Cancel / Edit ticket / Save */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8), paddingHorizontal: s(16), paddingTop: s(8), paddingBottom: s(10) }}>
            <Pressable onPress={onClose} hitSlop={8} style={{ minWidth: s(54) }}>
              <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(15), color: ScanV2Colors.sec }}>Cancel</ScanText>
            </Pressable>
            <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(20), color: ScanV2Colors.text }}>Edit ticket</ScanText>
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
            {/* Movie */}
            <SectionCard title="Movie">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
                <View style={{ width: s(48), height: s(68), borderRadius: s(8), overflow: 'hidden', backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center' }}>
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Icon name="film" size={s(22)} color={ScanV2Colors.ter} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(21), color: ScanV2Colors.text }}>
                    {movie ? movie.title : 'No match'}
                  </ScanText>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignSelf: 'flex-start',
                      alignItems: 'center',
                      gap: s(5),
                      marginTop: s(4),
                      paddingVertical: s(3),
                      paddingHorizontal: s(8),
                      borderRadius: 999,
                      backgroundColor: movie
                        ? confident
                          ? 'rgba(16,185,129,0.14)'
                          : 'rgba(251,191,36,0.14)'
                        : 'rgba(251,191,36,0.14)',
                    }}
                  >
                    <Icon
                      name={movie ? (confident ? 'check' : 'info') : 'warn'}
                      size={s(12)}
                      color={movie ? (confident ? ScanV2Colors.emerald : ScanV2Colors.amber) : ScanV2Colors.amber}
                    />
                    <ScanText
                      style={{
                        fontFamily: Fonts.inter.semibold,
                        fontSize: s(11.5),
                        lineHeight: s(14),
                        color: movie ? (confident ? ScanV2Colors.emerald : ScanV2Colors.amber) : ScanV2Colors.amber,
                      }}
                    >
                      {movie ? (confident ? `AI match · ${confidence}%` : `Low confidence · ${confidence}%`) : 'No match — pick a title'}
                    </ScanText>
                  </View>
                </View>
                <PillButton kind="soft" icon="search" label="Change" onPress={() => openPicker('movie')} />
              </View>
            </SectionCard>

            {/* From your ticket */}
            <SectionCard title="From your ticket">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(12) }}>
                <EditField label="Theater" value={form.theater} onChangeText={(v) => set('theater', v)} onInputFocus={handleInputFocus} placeholder="Theater name" />
                <EditField label="Date" value={formatEditDate(form.dateISO)} onTap={() => openPicker('date')} picker="calendar" placeholder="Pick date" />
                <EditField label="Time" value={form.time} onTap={() => openPicker('time')} picker="clock" placeholder="Pick time" />
                <EditField label="Rated" value={form.rated} onTap={() => openPicker('rated')} picker="info" placeholder="—" />
              </View>
            </SectionCard>

            {/* More detail (only-populated, or expanded) */}
            {showMoreDetail && (
              <SectionCard title="More detail">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(12) }}>
                  {visibleOptional.map((o) => (
                    <EditField
                      key={o.key}
                      label={o.label}
                      value={form[o.key]}
                      onChangeText={o.tap ? undefined : (v) => set(o.key, v)}
                      onTap={o.tap ? () => openPicker(o.tap!) : undefined}
                      onInputFocus={o.tap ? undefined : handleInputFocus}
                      picker={o.icon}
                      placeholder={o.placeholder}
                    />
                  ))}
                </View>
              </SectionCard>
            )}

            {/* dashed "Add detail" affordance */}
            {!showAdd && missing.length > 0 && (
              <Pressable onPress={() => setShowAdd(true)} style={{ marginTop: s(12) }}>
                <DashedBorder radius={s(14)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), paddingVertical: s(12), paddingHorizontal: s(14) }}>
                    <Icon name="plus" size={s(16)} color={ScanV2Accent.primary} />
                    <ScanText style={{ flex: 1, fontFamily: Fonts.inter.medium, fontSize: s(13.5), lineHeight: s(17), color: ScanV2Colors.sec }}>
                      Add {missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(', ')}
                      {missing.length > 3 ? '…' : ''}
                    </ScanText>
                  </View>
                </DashedBorder>
              </Pressable>
            )}

            {/* "Also on your ticket — not tracked" — hidden for now */}
            {SHOW_UNTRACKED && <View />}

            {/* bottom spacer — when the keyboard is up, reserve its height so the
                focused field can always scroll above it; otherwise reserve the
                home-indicator inset so the last field clears it and the form
                scrolls comfortably to the very bottom. */}
            <View style={{ height: (kbHeight > 0 ? kbHeight : insets.bottom) + s(8) }} />
          </ScrollView>
        </View>

        {/* stacked picker — inside the modal so it keeps the sheet + scroll */}
        {picker && (
          <PickerOverlay
            kind={picker}
            currentMovie={picker === 'movie' ? movie : null}
            currentValue={pickerValue()}
            onPickMovie={(m) => {
              setMovie(m);
              setPicker(null);
            }}
            onPickValue={handlePickValue}
            onClose={() => setPicker(null)}
          />
        )}
      </View>
    </Modal>
  );
}

// ============================================================================
// Section card + labelled field
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
  onChangeText?: (v: string) => void;
  onTap?: () => void;
  /** Called with the field's TextInput on focus (drives keyboard avoidance). */
  onInputFocus?: (input: TextInput | null) => void;
}

function EditField({ label, value, placeholder, picker, onChangeText, onTap, onInputFocus }: EditFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const boxStyle = {
    minHeight: s(42),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    <View style={{ flex: 1, minWidth: s(120) }}>
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
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => onInputFocus?.(inputRef.current)}
            placeholder={placeholder}
            placeholderTextColor={ScanV2Colors.ter}
            allowFontScaling={false}
            style={{ flex: 1, padding: 0, color: ScanV2Colors.text, fontFamily: Fonts.inter.semibold, fontSize: s(15) }}
          />
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Dashed border (SVG — never single-side borderStyle:'dashed', per README)
// ============================================================================

function DashedBorder({ radius, children }: { radius: number; children: React.ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Rect
            x={0.75}
            y={0.75}
            width={size.w - 1.5}
            height={size.h - 1.5}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={ScanV2Colors.fieldLine}
            strokeWidth={1.5}
            strokeDasharray="5,4"
          />
        </Svg>
      )}
      {children}
    </View>
  );
}

// ============================================================================
// Keyboard height (drives the Android bottom spacer)
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
