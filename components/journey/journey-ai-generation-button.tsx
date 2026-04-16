import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { getGenreNamesByIds } from '@/lib/genre-service';
import { useGenerateArt } from '@/hooks/use-generate-art';
import { useRewardedAd } from '@/hooks/use-rewarded-ad';
import { useGrantAdReward } from '@/hooks/use-grant-ad-reward';
import { usePremium } from '@/hooks/use-premium';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';

interface JourneyAIGenerationButtonProps {
  journeyId: string;
  movieTitle: string;
  genreIds: number[] | null;
  posterPath: string | null;
  hasAiPoster?: boolean;
  onUpgradePress: () => void;
}

export function JourneyAIGenerationButton({
  journeyId,
  movieTitle,
  genreIds,
  posterPath,
  hasAiPoster = false,
  onUpgradePress,
}: JourneyAIGenerationButtonProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const { tier } = usePremium();
  const { generateArt, isGenerating, hasUsedFreeTrial, adCredits } = useGenerateArt();
  const { loaded: adLoaded, showAd, reloadAd } = useRewardedAd('ai');
  const { grantCredit, isGranting } = useGrantAdReward();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleWatchAd = useCallback(async () => {
    hapticImpact();
    const earned = await showAd();
    if (earned) {
      const granted = await grantCredit();
      if (granted) {
        hapticNotification(NotificationFeedbackType.Success);
        Toast.show({
          type: 'success',
          text1: 'Credit earned!',
          text2: 'Tap Generate AI Art to use it.',
        });
      } else {
        hapticNotification(NotificationFeedbackType.Error);
        Toast.show({
          type: 'error',
          text1: 'Could not grant credit',
          text2: 'Something went wrong. Please try again.',
        });
      }
      reloadAd();
    } else {
      hapticNotification(NotificationFeedbackType.Warning);
      Toast.show({
        type: 'info',
        text1: 'Watch the full ad to earn a credit',
      });
    }
  }, [showAd, grantCredit, reloadAd]);

  const handleGenerateArt = useCallback(async () => {
    hapticImpact();
    try {
      const genreNames = genreIds ? getGenreNamesByIds(genreIds) : [];
      const posterUrl = getTMDBImageUrl(posterPath, 'w780') || '';
      await generateArt({
        journeyId,
        movieTitle,
        genres: genreNames,
        posterUrl,
      });
      hapticNotification(NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to generate art:', error);
    }
  }, [journeyId, movieTitle, genreIds, posterPath, generateArt]);

  if (hasAiPoster) return null;

  return (
    <View style={styles.posterOptionsSection}>
      {tier === 'free' && hasUsedFreeTrial && adCredits <= 0 ? (
        <>
          <Pressable
            style={[styles.generateArtButton, !adLoaded && styles.generateArtButtonDisabled]}
            onPress={handleWatchAd}
            disabled={!adLoaded || isGranting}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
              <Path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            </Svg>
            <Text style={styles.generateArtButtonText}>
              {!adLoaded ? 'Loading ad...' : 'Watch Ad for 1 Generation'}
            </Text>
          </Pressable>

          <Pressable style={styles.upgradeNudge} onPress={onUpgradePress}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.tint} strokeWidth={2}>
              <Path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </Svg>
            <View style={styles.upgradeNudgeText}>
              <Text style={styles.upgradeNudgeTitle}>Free AI poster used</Text>
              <Text style={styles.upgradeNudgeSubtitle}>Upgrade to PocketStubs+ for unlimited AI art</Text>
            </View>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}>
              <Path d="M9 18l6-6-6-6" />
            </Svg>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={styles.generateArtButton}
          onPress={handleGenerateArt}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.generateArtButtonText}>Generating...</Text>
            </>
          ) : (
            <>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                <Path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </Svg>
              <Text style={styles.generateArtButtonText}>
                {tier === 'free' && !hasUsedFreeTrial ? 'Generate AI Art (1 free trial)' : 'Generate AI Art'}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) => StyleSheet.create({
  posterOptionsSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  generateArtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: colors.tint,
    borderRadius: BorderRadius.md,
  },
  generateArtButtonText: {
    ...Typography.button.primary,
    color: colors.text,
  },
  generateArtButtonDisabled: {
    opacity: 0.5,
  },
  upgradeNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upgradeNudgeText: {
    flex: 1,
  },
  upgradeNudgeTitle: {
    ...Typography.body.smMedium,
    color: colors.text,
  },
  upgradeNudgeSubtitle: {
    ...Typography.caption.default,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
