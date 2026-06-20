import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { StepLayout } from '@/components/onboarding/v2/shared/step-layout';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { useOnboardingV2, type ViewingPref } from '@/components/onboarding/v2/onboarding-v2-context';
import type { StepProps } from '@/components/onboarding/v2/types';

interface Option {
  value: ViewingPref;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  tagline: string;
}

const OPTIONS: Option[] = [
  { value: 'theater', icon: 'ticket-outline', title: 'Mostly the theater', sub: 'Big screen, opening night', tagline: "We'll put ticket scanning front and center." },
  { value: 'streaming', icon: 'tv-outline', title: 'Mostly streaming', sub: 'At home, on my schedule', tagline: "We'll keep your watchlist ready to go." },
  { value: 'both', icon: 'sparkles-outline', title: 'A bit of both', sub: 'Theater nights and couch nights', tagline: "You'll get the best of both worlds." },
];

export function WhereStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const { data, update } = useOnboardingV2();

  return (
    <StepLayout
      title="Where do you usually watch?"
      subtitle="This decides which tools we surface first."
      footer={<CTAButton label="Continue" onPress={onNext} disabled={data.where === null} />}
    >
      <View style={styles.list}>
        {OPTIONS.map((opt) => {
          const selected = data.where === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => update({ where: opt.value })}
              style={[
                styles.card,
                {
                  backgroundColor: selected ? `${colors.tint}1A` : colors.card,
                  borderColor: selected ? colors.tint : colors.border,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                {selected ? (
                  <LinearGradient
                    colors={[colors.tint, colors.accentHover]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconTile}
                  >
                    <Ionicons name={opt.icon} size={24} color="#fff" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.iconTile, { backgroundColor: colors.backgroundSecondary }]}>
                    <Ionicons name={opt.icon} size={24} color={colors.textSecondary} />
                  </View>
                )}
                <View style={styles.cardText}>
                  <ThemedText style={[styles.cardTitle, { color: colors.text }]}>{opt.title}</ThemedText>
                  <ThemedText style={[styles.cardSub, { color: colors.textTertiary }]}>{opt.sub}</ThemedText>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={colors.tint} />}
              </View>
              {selected && (
                <ThemedText style={[styles.tagline, { color: colors.tint }]}>{opt.tagline}</ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconTile: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...Typography.body.lg },
  cardSub: { ...Typography.body.sm },
  tagline: { ...Typography.body.smMedium, paddingLeft: 56 + Spacing.md },
});
