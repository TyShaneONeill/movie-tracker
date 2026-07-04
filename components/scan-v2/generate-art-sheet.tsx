/**
 * Ticket Scan v2 — `GenerateArtSheet`.
 *
 * On-demand AI-poster generation bottom sheet, opened when the on-card
 * Original|AI segmented pill's AI side is tapped on a journey with no AI art
 * yet (replaces the old persistent bottom action bar on the journey screen).
 *
 * States mirror `JourneyAIGenerationButton` (v1 keeps that component):
 *  - can generate (premium, unused free trial, or ad credits) → primary
 *    "Generate AI poster" + a free-quota line
 *  - out of generations (free tier) → "Watch ad for 1 generation", dimmed
 *    "Ad not ready — tap to retry" while the ad loads (tap retries the load)
 *  - the PocketStubs+ upsell lives ONLY here (free tier)
 *
 * Generation takes ~30s server-side; tapping Generate fires the mutation and
 * closes the sheet — `useGenerateArt`'s toasts cover progress/success/failure.
 * Theme-aware (`useScanColors`/`ScanV2Accent`), text via `ScanText`, `s()` sizes.
 */

import React, { useCallback } from 'react';
import { View, Modal, Pressable } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsMutating } from '@tanstack/react-query';

import { Fonts } from '@/constants/theme';
import { MUTATION_KEYS } from '@/lib/query-client';
import { useScanColors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { getGenreNamesByIds } from '@/lib/genre-service';
import { useGenerateArt } from '@/hooks/use-generate-art';
import { useRewardedAd } from '@/hooks/use-rewarded-ad';
import { useGrantAdReward } from '@/hooks/use-grant-ad-reward';
import { setPendingAiCredit } from '@/lib/pending-ai-credit';
import { usePremium } from '@/hooks/use-premium';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import type { UserMovie } from '@/lib/database.types';
import { Icon, ScanText, PillButton } from './primitives';

interface GenerateArtSheetProps {
  journey: UserMovie;
  onClose: () => void;
  /** Opens the PocketStubs+ upgrade sheet (the caller closes this sheet first). */
  onUpgradePress: () => void;
}

export function GenerateArtSheet({ journey, onClose, onUpgradePress }: GenerateArtSheetProps) {
  const c = useScanColors();
  const insets = useSafeAreaInsets();

  const { tier } = usePremium();
  const { generateArt, isGenerating: isGeneratingLocal, hasUsedFreeTrial, adCredits } = useGenerateArt();
  const { loaded: adLoaded, showAd, reloadAd } = useRewardedAd('ai');
  const { grantCredit, isGranting } = useGrantAdReward();

  // The sheet closes right after firing (fire-and-close, ~30s server round
  // trip), which unmounts this instance and its local isPending. Count ALL
  // in-flight generate-art mutations so a reopened sheet can't fire a second
  // generation while one is still running.
  const generatingGlobally = useIsMutating({ mutationKey: [MUTATION_KEYS.GENERATE_ART] }) > 0;
  const isGenerating = isGeneratingLocal || generatingGlobally;

  // Out of generations (free tier, trial spent, no ad credits) → the ad path.
  const needsAd = tier === 'free' && hasUsedFreeTrial && adCredits <= 0;

  const handleGenerate = useCallback(() => {
    hapticImpact();
    const genreNames = journey.genre_ids ? getGenreNamesByIds(journey.genre_ids) : [];
    const posterUrl = getTMDBImageUrl(journey.poster_path, 'w780') || '';
    // Fire-and-close: the hook's toasts announce progress and the result, and
    // the card updates via query invalidation when the art lands (~30s).
    generateArt({
      journeyId: journey.id,
      movieTitle: journey.title,
      genres: genreNames,
      posterUrl,
    }).catch(() => {
      // errors are surfaced by useGenerateArt's onError toast
    });
    onClose();
  }, [journey, generateArt, onClose]);

  const handleWatchAd = useCallback(async () => {
    hapticImpact();
    if (!adLoaded) {
      // Same recovery path as v1: retry the load and say so, instead of a
      // dead disabled button.
      reloadAd();
      Toast.show({
        type: 'info',
        text1: 'Ad not ready yet',
        text2: 'Give it a few seconds, then tap again.',
      });
      return;
    }
    // Persist on earn (before the ad closes) so a kill mid-flow is recoverable.
    const earned = await showAd(() => {
      void setPendingAiCredit({ journeyId: journey.id, earnedAt: Date.now() });
    });
    if (earned) {
      const granted = await grantCredit();
      if (granted) {
        hapticNotification(NotificationFeedbackType.Success);
        Toast.show({
          type: 'success',
          text1: 'Credit earned!',
          text2: 'Tap Generate AI poster to use it.',
        });
      } else {
        // Credit stays persisted → auto-redeems when the app is next active.
        hapticNotification(NotificationFeedbackType.Warning);
        Toast.show({
          type: 'info',
          text1: 'Finishing up…',
          text2: "We'll add your credit in a moment — your ad counted.",
        });
      }
      reloadAd();
    } else {
      hapticNotification(NotificationFeedbackType.Warning);
      Toast.show({ type: 'info', text1: 'Watch the full ad to earn a credit' });
    }
  }, [adLoaded, reloadAd, showAd, grantCredit]);

  const quotaLine = needsAd
    ? 'Free poster used · no generations left'
    : tier !== 'free'
      ? 'Included with PocketStubs+ — unlimited'
      : !hasUsedFreeTrial
        ? 'Your first AI poster is free'
        : `${adCredits} ad generation${adCredits === 1 ? '' : 's'} available`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' } as any} onPress={onClose} />

        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: s(26),
            borderTopRightRadius: s(26),
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.line,
            overflow: 'hidden',
          }}
        >
          {/* grabber */}
          <View style={{ alignItems: 'center', paddingTop: s(10) }}>
            <View style={{ width: s(38), height: s(5), borderRadius: 999, backgroundColor: c.lineHi }} />
          </View>

          {/* top row: X */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: s(16), paddingTop: s(8) }}>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: c.field, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={s(16)} color={c.sec} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: s(16), paddingTop: s(2) }}>
            {/* headline */}
            <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(24), lineHeight: s(28), letterSpacing: -0.4, color: c.text }}>
              Generate AI poster
            </ScanText>
            <ScanText
              numberOfLines={2}
              style={{ fontFamily: Fonts.inter.regular, fontSize: s(13.5), lineHeight: s(19.5), color: c.sec, marginTop: s(6) }}
            >
              One-of-a-kind cover art for this viewing of {journey.title}.
            </ScanText>

            {/* primary action */}
            <View style={{ marginTop: s(18) }}>
              {needsAd ? (
                <PillButton
                  full
                  icon="bolt"
                  label={isGranting ? 'Granting credit…' : adLoaded ? 'Watch ad for 1 generation' : 'Ad not ready — tap to retry'}
                  onPress={() => void handleWatchAd()}
                  disabled={isGranting}
                  style={!adLoaded && !isGranting ? { opacity: 0.5 } : undefined}
                />
              ) : (
                <PillButton
                  full
                  icon="sparkle"
                  label={isGenerating ? 'Generating…' : 'Generate AI poster'}
                  onPress={handleGenerate}
                  disabled={isGenerating}
                />
              )}
            </View>

            {/* free-quota line */}
            <ScanText
              style={{
                fontFamily: Fonts.mono.medium,
                fontSize: s(11),
                lineHeight: s(14),
                letterSpacing: 0.5,
                color: c.ter,
                textAlign: 'center',
                marginTop: s(10),
                textTransform: 'uppercase',
              }}
            >
              {quotaLine}
            </ScanText>

            {/* PocketStubs+ upsell — lives ONLY in this sheet */}
            {tier === 'free' ? (
              <Pressable
                onPress={onUpgradePress}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(12),
                  padding: s(14),
                  borderRadius: s(15),
                  backgroundColor: c.field,
                  borderWidth: 1,
                  borderColor: c.line,
                  marginTop: s(16),
                }}
              >
                <View
                  style={{
                    width: s(34),
                    height: s(34),
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ScanV2Accent.soft,
                  }}
                >
                  <Icon name="sparkle" size={s(17)} color={ScanV2Accent.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(15), lineHeight: s(19), color: c.text }}>
                    PocketStubs+
                  </ScanText>
                  <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(12.5), lineHeight: s(16), color: c.sec, marginTop: s(1) }}>
                    Unlimited AI posters — no ads
                  </ScanText>
                </View>
                <Icon name="chevR" size={s(16)} color={c.ter} />
              </Pressable>
            ) : null}
          </View>

          {/* home-indicator safe spacer */}
          <View style={{ height: insets.bottom + s(20) }} />
        </View>
      </View>
    </Modal>
  );
}

export default GenerateArtSheet;
