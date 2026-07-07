/**
 * StreakPunchCard (PS-15 PR 3) — the profile punch-card surface.
 *
 * A cinema ticket-stub card: a big current-streak numeral with diary framing
 * ("Day 12 — you logged a movie"), a 7-day punch row (a punched stub per day
 * with activity), a banked rain-check indicator, and milestone chips
 * (3/7/30/100). Reuses the PerforatedEdge primitive for the tear line. Renders
 * NOTHING when the daily_hooks flag is off.
 *
 * Milestone celebrations are fired from StreakProvider on the recording call,
 * not here — this surface is display-only. Liveness is computed client-side
 * (isStreakAlive) so the card stays honest between nightly reconciliations.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { PerforatedEdge } from '@/components/ui/perforated-edge';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useDailyHooksEnabled } from '@/hooks/use-feature-flag';
import { useStreak } from '@/lib/streak-context';
import { getStreakCard, type StreakCard } from '@/lib/streak-service';
import { MILESTONES } from '@/lib/streak-logic';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Diary framing per first_action of the day. We store the action type, not the
// title, so the phrasing stays title-agnostic (honest to the stored data).
const ACTION_PHRASE: Record<string, string> = {
  rate: 'you rated a movie',
  log: 'you logged a movie',
  first_take: 'you posted a first take',
  review: 'you wrote a review',
  comment: 'you joined a conversation',
  like: 'you showed some love',
  watchlist_add: 'you added to your watchlist',
  scan: 'you scanned a ticket',
  tv_status: 'you logged an episode',
};

function diaryLine(streak: number, firstAction: string | null): string {
  const phrase = firstAction ? ACTION_PHRASE[firstAction] : undefined;
  if (streak <= 0) return 'Log anything today to start a streak.';
  const day = `Day ${streak}`;
  return phrase ? `${day} — ${phrase} today.` : `${day} of your streak.`;
}

/** The 7 local dates ending today, oldest→newest, as 'YYYY-MM-DD'. */
function last7Dates(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

export function StreakPunchCard() {
  const dailyHooksEnabled = useDailyHooksEnabled();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { streakVersion } = useStreak();
  const [card, setCard] = useState<StreakCard | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const data = await getStreakCard();
    setCard(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!dailyHooksEnabled) return;
    void load();
  }, [dailyHooksEnabled, load, streakVersion]);

  // Flag off, still loading, or no data → render nothing.
  if (!dailyHooksEnabled || !loaded || !card) return null;

  const { snapshot, activityDays, localDate, effectiveStreak } = card;
  const activeDates = new Set(activityDays.map((a) => a.local_date));
  const week = last7Dates(localDate);

  return (
    <View style={styles.wrap}>
      <ThemedText style={[styles.sectionLabel, { color: colors.textTertiary }]}>
        DAILY STREAK
      </ThemedText>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Top stub: the big number + diary line */}
        <View style={styles.top}>
          <ThemedText
            style={[styles.bigNumber, { color: effectiveStreak > 0 ? colors.tint : colors.textTertiary }]}
          >
            {effectiveStreak}
          </ThemedText>
          <View style={styles.topText}>
            <ThemedText style={[styles.dayWord, { color: colors.textSecondary }]}>
              {effectiveStreak === 1 ? 'day' : 'days'} in a row
            </ThemedText>
            <ThemedText style={[styles.diary, { color: colors.text }]}>
              {diaryLine(effectiveStreak, activityDays[0]?.first_action ?? null)}
            </ThemedText>
          </View>
        </View>

        <PerforatedEdge colors={colors} />

        {/* Bottom stub: 7-day punch row + rain checks + milestones */}
        <View style={styles.bottom}>
          <View style={styles.week}>
            {week.map((date, i) => {
              const punched = activeDates.has(date);
              const isToday = date === localDate;
              return (
                <View key={date} style={styles.dayCol}>
                  <View
                    style={[
                      styles.punch,
                      {
                        backgroundColor: punched ? colors.tint : 'transparent',
                        borderColor: punched ? colors.tint : colors.border,
                      },
                      isToday && !punched && { borderColor: colors.textSecondary },
                    ]}
                  >
                    <ThemedText style={[styles.punchMark, { color: colors.card }]}>
                      {punched ? '★' : ''}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.dayLabel, { color: colors.textTertiary }]}>
                    {DAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.rainChecks}>
              <ThemedText style={[styles.rainLabel, { color: colors.textSecondary }]}>
                Rain checks
              </ThemedText>
              <View style={styles.rainDots}>
                {[0, 1].map((i) => (
                  <ThemedText
                    key={i}
                    style={[
                      styles.rainDot,
                      { color: i < snapshot.rainChecks ? colors.gold : colors.border },
                    ]}
                  >
                    🎟️
                  </ThemedText>
                ))}
              </View>
            </View>
            {snapshot.rainChecksUsed > 0 && (
              <ThemedText style={[styles.rainUsed, { color: colors.textTertiary }]}>
                {snapshot.rainChecksUsed} used
              </ThemedText>
            )}
          </View>

          <View style={styles.milestones}>
            {MILESTONES.map((m) => {
              const reached = snapshot.longestStreak >= m;
              return (
                <View
                  key={m}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: reached ? colors.tint : 'transparent',
                      borderColor: reached ? colors.tint : colors.border,
                    },
                  ]}
                >
                  <ThemedText
                    style={[styles.chipText, { color: reached ? colors.card : colors.textTertiary }]}
                  >
                    {m}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    ...Typography.body.xs,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  bigNumber: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 52,
    lineHeight: 58, // explicit — Outfit extrabold clips at the top without it
    minWidth: 64,
    textAlign: 'center',
  },
  topText: {
    flex: 1,
  },
  dayWord: {
    ...Typography.body.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diary: {
    ...Typography.body.base,
    marginTop: 2,
  },
  bottom: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  punch: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  punchMark: {
    fontSize: 15,
    lineHeight: 18,
  },
  dayLabel: {
    ...Typography.body.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rainChecks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rainLabel: {
    ...Typography.body.sm,
  },
  rainDots: {
    flexDirection: 'row',
    gap: 2,
  },
  rainDot: {
    fontSize: 14,
    lineHeight: 18,
  },
  rainUsed: {
    ...Typography.body.xs,
  },
  milestones: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
});
