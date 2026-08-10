import React from 'react';
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

      <Pressable onPress={onPick} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.tint }, pressed && { opacity: 0.85 }]}>
        <Text style={styles.primaryBtnText}>Choose export file</Text>
      </Pressable>
    </View>
  );
}
