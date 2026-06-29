/**
 * Ticket Scan v2 — `TimeWheel` (the Time Dial).
 *
 * Native recreation of the prototype's `TimeWheel`/`WheelColumn`: three
 * snap-scrolling wheels (Hour 1–12 · Minute 00–59 · AM/PM), 5 rows tall, a
 * center selection band, and a big rose label. The "Set time" CTA lives in the
 * host sheet's sticky footer (always reachable); this component reports the live
 * label up via `onChange` so the footer can commit it.
 *
 * Replaces preset showtime lists so ANY time is reachable (a home watch could be
 * 3 AM). Each column initializes scrolled to its current value (rAF-aligned after
 * layout) and snaps to the nearest item on settle. Drag/flick is the primary
 * interaction; tapping a visible row also selects it.
 *
 * Native snap details (mirrors the README §3b warnings about looping/hanging):
 *  - The item height is ROUNDED to an integer (`ITEM`) so the snap interval never
 *    drifts on sub-pixel scales.
 *  - `nestedScrollEnabled` keeps the columns drag-scrollable on Android even when
 *    rendered inside a sheet (a same-axis parent ScrollView would otherwise
 *    swallow the pan — the picker now hosts the wheel in a plain View to avoid
 *    that, and this is the belt-and-braces guard).
 *  - We never re-scroll inside the scroll handler; `snapToInterval` does the
 *    snapping and we only read the settled index on `onMomentumScrollEnd` /
 *    `onScrollEndDrag`. Programmatic scrolls happen only on mount or a tap, each
 *    guarded by `lastIndex` so a settle that matches the current value can't
 *    trigger a feedback re-scroll.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { ScanText } from './primitives';

const VISIBLE_ROWS = 5;
const COL_WIDTH = 64;

interface ParsedTime {
  h: number;
  min: number;
  ap: 'AM' | 'PM';
}

/** Parse a `7:30 PM` style label, falling back to 7:30 PM. */
export function parseTimeLabel(str: string | undefined): ParsedTime {
  const m = (str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m) {
    return {
      h: Math.min(12, Math.max(1, parseInt(m[1], 10))),
      min: Math.min(59, Math.max(0, parseInt(m[2], 10))),
      ap: m[3].toUpperCase() === 'AM' ? 'AM' : 'PM',
    };
  }
  return { h: 7, min: 30, ap: 'PM' };
}

interface WheelColumnProps<T extends string | number> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  width: number;
}

function WheelColumn<T extends string | number>({
  items,
  value,
  onChange,
  format,
  width,
}: WheelColumnProps<T>) {
  const ITEM = Math.round(s(40));
  const scrollRef = useRef<ScrollView>(null);
  const idxOf = useCallback((v: T) => Math.max(0, items.indexOf(v)), [items]);
  const lastIndex = useRef(idxOf(value));

  // Align to the current value once, after first layout.
  useEffect(() => {
    const i = idxOf(value);
    lastIndex.current = i;
    const r = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: i * ITEM, animated: false });
    });
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
      if (i !== lastIndex.current) {
        lastIndex.current = i;
        onChange(items[i]);
      }
    },
    [items, ITEM, onChange]
  );

  const selectedIndex = idxOf(value);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width, height: ITEM * VISIBLE_ROWS }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      onMomentumScrollEnd={onSettle}
      onScrollEndDrag={onSettle}
      contentContainerStyle={{ paddingVertical: ITEM * 2 }}
    >
      {items.map((it, i) => {
        const on = i === selectedIndex;
        return (
          <Pressable
            key={`${it}`}
            onPress={() => {
              lastIndex.current = i;
              scrollRef.current?.scrollTo({ y: i * ITEM, animated: true });
              onChange(it);
            }}
            style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}
          >
            <ScanText
              style={{
                fontFamily: on ? Fonts.outfit.extrabold : Fonts.outfit.semibold,
                fontSize: on ? s(24) : s(20),
                lineHeight: on ? s(28) : s(24),
                color: on ? ScanV2Colors.text : ScanV2Colors.ter,
                opacity: on ? 1 : 0.5,
              }}
            >
              {format ? format(it) : `${it}`}
            </ScanText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface TimeWheelProps {
  current?: string;
  /** Reports the live label (fires on mount + every wheel change) so the host
   *  sheet can commit it from a sticky footer button. */
  onChange: (label: string) => void;
}

export function TimeWheel({ current, onChange }: TimeWheelProps) {
  const init = parseTimeLabel(current);
  const [h, setH] = React.useState<number>(init.h);
  const [min, setMin] = React.useState<number>(init.min);
  const [ap, setAp] = React.useState<'AM' | 'PM'>(init.ap);

  const hours = React.useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const mins = React.useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const ampm = React.useMemo<('AM' | 'PM')[]>(() => ['AM', 'PM'], []);

  const ITEM = Math.round(s(40));
  const label = `${h}:${String(min).padStart(2, '0')} ${ap}`;
  const colW = s(COL_WIDTH);

  // Keep the host in sync with the current wheel value (initial + on change).
  React.useEffect(() => {
    onChange(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  return (
    <View>
      {/* big rose label */}
      <View style={{ alignItems: 'center', marginBottom: s(8) }}>
        <ScanText
          style={{
            fontFamily: Fonts.outfit.extrabold,
            fontSize: s(34),
            lineHeight: s(40),
            letterSpacing: -0.5,
            color: ScanV2Accent.primary,
          }}
        >
          {label}
        </ScanText>
      </View>

      {/* wheels + center band */}
      <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(2) }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: s(8),
            right: s(8),
            top: '50%',
            height: ITEM,
            transform: [{ translateY: -ITEM / 2 }],
            borderRadius: s(12),
            backgroundColor: ScanV2Colors.field,
            borderWidth: 1,
            borderColor: ScanV2Colors.fieldLine,
          }}
        />
        <WheelColumn items={hours} value={h} onChange={setH} width={colW} />
        <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(24), lineHeight: s(28), color: ScanV2Colors.text }}>:</ScanText>
        <WheelColumn items={mins} value={min} onChange={setMin} format={(m) => String(m).padStart(2, '0')} width={colW} />
        <WheelColumn items={ampm} value={ap} onChange={setAp} width={colW} />
      </View>
    </View>
  );
}
