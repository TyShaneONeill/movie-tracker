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
              <ThemedText
                style={[styles.decade, { color: selected ? colors.tint : colors.text }]}
                numberOfLines={1}
              >
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
              <View
                style={[
                  styles.ring,
                  { borderColor: selected ? colors.tint : colors.border, backgroundColor: selected ? colors.tint : 'transparent' },
                ]}
              >
                {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
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
          <View
            style={[
              styles.ring,
              { borderColor: data.eraAgnostic ? colors.tint : colors.border, backgroundColor: data.eraAgnostic ? colors.tint : 'transparent' },
            ]}
          >
            {data.eraAgnostic && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
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
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  decade: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -1,
    width: 60,
  },
  rowBody: { flex: 1, gap: 2 },
  movement: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  films: { ...Typography.body.xs },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.xs,
  },
  optOutText: { ...Typography.body.smMedium, flex: 1 },
});
