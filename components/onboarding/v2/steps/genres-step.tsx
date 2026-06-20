import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { StepLayout } from '@/components/onboarding/v2/shared/step-layout';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { useOnboardingV2 } from '@/components/onboarding/v2/onboarding-v2-context';
import { ONBOARDING_GENRES, MIN_GENRES } from '@/components/onboarding/v2/data/genres';
import type { StepProps } from '@/components/onboarding/v2/types';

export function GenresStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const { data, toggleGenre } = useOnboardingV2();
  const count = data.genres.length;
  const remaining = Math.max(0, MIN_GENRES - count);
  const canContinue = count >= MIN_GENRES;

  const counterText = canContinue
    ? `${count} selected`
    : `${count} selected · ${remaining} more`;

  return (
    <StepLayout
      title="What do you love to watch?"
      subtitle="Pick at least 3 — this shapes your home feed and recommendations."
      footer={<CTAButton label="Continue" onPress={onNext} disabled={!canContinue} />}
    >
      <View style={styles.chips}>
        {ONBOARDING_GENRES.map((genre) => {
          const selected = data.genres.includes(genre.slug);
          return (
            <Pressable
              key={genre.slug}
              onPress={() => toggleGenre(genre.slug)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? `${genre.color}22` : 'rgba(255,255,255,0.04)',
                  borderColor: selected ? genre.color : colors.border,
                  transform: [{ scale: selected ? 1.02 : 1 }],
                },
              ]}
            >
              <Ionicons
                name={genre.icon}
                size={16}
                color={selected ? genre.color : colors.textSecondary}
              />
              <ThemedText
                style={[styles.chipLabel, { color: selected ? colors.text : colors.textSecondary }]}
              >
                {genre.label}
              </ThemedText>
              {selected && (
                <View style={[styles.checkBadge, { backgroundColor: genre.color }]}>
                  <Ionicons name="checkmark" size={11} color="#fff" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <ThemedText style={[styles.counter, { color: canContinue ? colors.accentSecondary : colors.textTertiary }]}>
        {counterText}
      </ThemedText>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipLabel: {
    ...Typography.body.smMedium,
  },
  checkBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    ...Typography.body.smMedium,
    marginTop: Spacing.lg,
  },
});
