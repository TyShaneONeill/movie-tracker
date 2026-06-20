import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { StepLayout } from '@/components/onboarding/v2/shared/step-layout';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { useOnboardingV2 } from '@/components/onboarding/v2/onboarding-v2-context';
import { ONBOARDING_ERAS } from '@/components/onboarding/v2/data/eras';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import type { StepProps } from '@/components/onboarding/v2/types';

export function ErasStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const { data, toggleEra, setEraAgnostic } = useOnboardingV2();
  const canContinue = data.eras.length >= 1 || data.eraAgnostic;

  return (
    <StepLayout
      title="Any era you gravitate to?"
      subtitle="Optional — pick the decades you love, or tell us you watch across all of them."
      footer={<CTAButton label="Continue" onPress={onNext} disabled={!canContinue} />}
    >
      <View style={styles.list}>
        {ONBOARDING_ERAS.map((era) => {
          const selected = data.eras.includes(era.slug);
          return (
            <Pressable
              key={era.slug}
              onPress={() => toggleEra(era.slug)}
              style={[
                styles.row,
                {
                  backgroundColor: selected ? `${colors.tint}1A` : colors.card,
                  borderColor: selected ? colors.tint : colors.border,
                },
              ]}
            >
              <ThemedText style={[styles.decade, { color: selected ? colors.tint : colors.text }]}>
                {era.label}
              </ThemedText>
              <View style={styles.rowBody}>
                <ThemedText style={[styles.movement, { color: selected ? colors.tint : colors.textTertiary }]}>
                  {era.movement}
                </ThemedText>
                <ThemedText style={[styles.films, { color: colors.textSecondary }]} numberOfLines={1}>
                  {era.films.join(' · ')}
                </ThemedText>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={20} color={colors.tint} />}
            </Pressable>
          );
        })}

        {/* Mutually-exclusive opt-out — reads as a real answer, not a skip. */}
        <Pressable
          onPress={setEraAgnostic}
          style={[
            styles.optOut,
            {
              borderColor: data.eraAgnostic ? colors.tint : colors.border,
              backgroundColor: data.eraAgnostic ? `${colors.tint}1A` : 'transparent',
            },
          ]}
        >
          <ThemedText
            style={[styles.optOutText, { color: data.eraAgnostic ? colors.tint : colors.textSecondary }]}
          >
            No era in particular — I watch across all of them
          </ThemedText>
          {data.eraAgnostic && <Ionicons name="checkmark-circle" size={20} color={colors.tint} />}
        </Pressable>
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  decade: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 32,
    letterSpacing: -1,
    width: 64,
  },
  rowBody: { flex: 1, gap: 3 },
  movement: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  films: { ...Typography.body.xs },
  optOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.xs,
  },
  optOutText: { ...Typography.body.smMedium, flex: 1 },
});
