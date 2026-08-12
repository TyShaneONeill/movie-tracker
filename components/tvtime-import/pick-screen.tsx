import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { TvTimeImportErrorCode } from '@/lib/tvtime-import';
import { TicketIcon, WarningIcon } from './icons';
import type { Styles, ThemeColors } from './tvtime-import-screen';

const AMBER = '#f59e0b';

// Codes where the picked file wasn't a (readable) TV Time export at all —
// gets the "wrong file selected" callout, mirroring the Letterboxd import's
// dedicated wrong-file state (app/settings/letterboxd-import.tsx).
const WRONG_FILE_CODES = new Set<TvTimeImportErrorCode>(['not-a-zip', 'unzip-failed', 'missing-expected-csv']);

// FREEZE-DEBUG instrumentation (temporary): a visible heartbeat proves the JS
// thread is alive and React is still committing renders; the probe button's
// tap counter proves touches are still reaching the JS responder system.
// Both are additive/harmless and will be removed once root cause is fixed.
function FreezeDebugHud() {
  const [tick, setTick] = useState(0);
  const [taps, setTaps] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => {
        const next = t + 1;
        console.log(`[FREEZE-DEBUG] heartbeat #${next} t=${Date.now()}`);
        return next;
      });
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ marginTop: Spacing.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#888', borderRadius: 8 }}>
      <Text style={{ color: '#0f0', fontFamily: 'monospace' }}>
        HB:{tick} since:{Math.round((Date.now() - startRef.current) / 1000)}s
      </Text>
      <Pressable
        onPress={() => {
          setTaps((n) => {
            console.log(`[FREEZE-DEBUG] probe tap #${n + 1} t=${Date.now()}`);
            return n + 1;
          });
        }}
        style={{ marginTop: 4, padding: 8, backgroundColor: '#333', borderRadius: 6 }}
      >
        <Text style={{ color: '#fff' }}>PROBE TAP (taps: {taps})</Text>
      </Pressable>
    </View>
  );
}

// Split into its own file (rather than a local function in
// tvtime-import-screen.tsx, where every other sub-screen lives) so it can be
// render-tested without pulling in that file's full import graph (supabase
// client, auth context, etc. — see __tests__/components/tvtime-import/pick-screen.test.tsx).
export function PickScreen({
  styles,
  colors,
  error,
  errorCode,
  onPick,
}: {
  styles: Styles;
  colors: ThemeColors;
  error: string | null;
  errorCode: TvTimeImportErrorCode | null;
  onPick: () => void;
}) {
  const isWrongFile = errorCode !== null && WRONG_FILE_CODES.has(errorCode);

  return (
    <View style={styles.pickBody}>
      <Text style={[Typography.display.h3, { color: colors.text }]}>Bring your history home.</Text>
      <Text style={[Typography.body.base, styles.pickSub, { color: colors.textSecondary }]}>
        Choose the ZIP you exported from TV Time — usually{' '}
        <Text style={{ color: colors.text, fontWeight: '700' }}>gdpr-data.zip</Text> (or a similar name). We read it on your
        device; nothing is imported until you confirm.
      </Text>

      <View style={[styles.dropzone, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TicketIcon color={colors.tint} size={40} />
        <Text style={[Typography.body.base, { color: colors.text, fontWeight: '700', marginTop: Spacing.sm }]}>gdpr-data.zip</Text>
        <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>usually in Downloads or Files</Text>
      </View>

      <Text style={[Typography.body.sm, styles.quiet, { color: colors.textTertiary }]}>
        TV Time closed July 15, 2026 — but your export file works forever.
      </Text>

      {error && isWrongFile && (
        <View style={[styles.warnBanner, { borderColor: AMBER }]}>
          <WarningIcon color={AMBER} size={16} />
          <View style={{ flex: 1 }}>
            <Text style={[Typography.body.sm, { color: AMBER, fontWeight: '700' }]}>Wrong file selected</Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}>{error}</Text>
          </View>
        </View>
      )}
      {error && !isWrongFile && <Text style={[Typography.body.sm, styles.errorText]}>{error}</Text>}

      {/* primaryBtn carries no top margin of its own (elsewhere it sits in a
          `footer` View that supplies spacing via `gap`) — here it's a direct
          sibling of the conditional error/warnBanner block above, so it needs
          its own margin or it butts right up against the banner. */}
      <Pressable
        onPress={onPick}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.tint, marginTop: error ? Spacing.lg : 0 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.primaryBtnText}>Choose export file</Text>
      </Pressable>

      <FreezeDebugHud />
    </View>
  );
}
