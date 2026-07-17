import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ContentContainer, formWidthStyle } from '@/components/content-container';
import { hapticImpact } from '@/lib/haptics';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';
import { TicketIcon } from '@/components/tvtime-import/icons';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

/**
 * Consolidated "Imports" screen — one home for every import source. Lists the
 * two sources that exist today (Letterboxd + TV Time). TV Time is always
 * reachable here, even after its onboarding "NEW" section demotes.
 */
export default function ImportsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const tvtime = useTvTimeImportGate();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentContainer style={formWidthStyle}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <ChevronLeftIcon color={colors.text} />
            </Pressable>
            <Text style={[Typography.display.h4, { color: colors.text }]}>Imports</Text>
            <View style={{ width: 24 }} />
          </View>

          <Text style={[Typography.body.sm, styles.intro, { color: colors.textSecondary }]}>
            Bring your history from another app into your PocketStubs.
          </Text>

          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                styles.firstRow,
                // When TV Time is flag-off, Letterboxd is the ONLY row — give it
                // the bottom radius + drop the divider so it reads as a full card.
                tvtime.enabled ? styles.rowDivider : styles.lastRow,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={() => { hapticImpact(); router.push('/settings/letterboxd-import'); }}
              accessibilityRole="button"
              accessibilityLabel="Letterboxd Import"
            >
              <View style={styles.rowMain}>
                <Image source={{ uri: 'https://a.ltrbxd.com/logos/letterboxd-mac-icon.png' }} style={styles.icon} />
                <View>
                  <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Letterboxd</Text>
                  <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Import your watched films</Text>
                </View>
              </View>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>

            {tvtime.enabled && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  styles.lastRow,
                  { backgroundColor: colors.card },
                  pressed && { backgroundColor: colors.backgroundSecondary },
                ]}
                onPress={() => { hapticImpact(); router.push('/settings/tvtime-import?from=settings'); }}
                accessibilityRole="button"
                accessibilityLabel="Import from TV Time"
              >
                <View style={styles.rowMain}>
                  <View style={styles.ticketIconWrap}>
                    <TicketIcon color={colors.tint} size={22} />
                  </View>
                  <View>
                    <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>TV Time</Text>
                    <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Bring your shows &amp; movies home</Text>
                  </View>
                </View>
                <ChevronRightIcon color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
  },
  intro: { paddingHorizontal: Spacing.md, marginBottom: Spacing.md, lineHeight: 18 },
  section: { paddingHorizontal: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  firstRow: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  lastRow: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  icon: { width: 30, height: 30, borderRadius: 7 },
  ticketIconWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
