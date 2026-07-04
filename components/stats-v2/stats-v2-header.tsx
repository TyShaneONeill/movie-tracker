import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Fonts } from '@/constants/theme';
import { usePremium } from '@/hooks/use-premium';
import { useStatsColors } from '@/constants/stats-v2-theme';

/**
 * Stats v2 header — "Analytics" title + membership pill (design section 1A).
 * Free = neutral surface + lock glyph; PocketStubs+ = gold tint + star glyph.
 * The pill is display-only in this PR; tapping affordances land with the
 * gated detail screens in a later stats-v2 PR.
 */
export function StatsV2Header() {
  const c = useStatsColors();
  const { isPremium, isLoading } = usePremium();

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: c.text }]}>Analytics</Text>
      {/* Hold the pill until premium status resolves so members never see a "Free" flash. */}
      {!isLoading && (
        <View
          style={[
            styles.pill,
            {
              borderColor: isPremium ? c.goldLine : c.line,
              backgroundColor: isPremium ? c.goldSoft : c.cardHi,
            },
          ]}
        >
          <Ionicons
            name={isPremium ? 'star' : 'lock-closed-outline'}
            size={13}
            color={isPremium ? c.gold : c.sec}
          />
          <Text style={[styles.pillText, { color: isPremium ? c.gold : c.sec }]}>
            {isPremium ? 'PocketStubs+' : 'Free'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  title: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 28,
    lineHeight: 34, // Outfit clips at tight line heights — keep breathing room
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
});
