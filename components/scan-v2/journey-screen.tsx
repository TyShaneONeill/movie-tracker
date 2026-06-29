/**
 * Ticket Scan v2 — `JourneyScreenV2` (the v2 `ScreenJourney`).
 *
 * Native re-skin of the design prototype's `ScreenJourney` (`scan-screens3.jsx`)
 * over the EXISTING v1 journey data layer (`useJourneysByMovie` +
 * `useJourneyMutations`). Rendered in place of the v1 `JourneyCarouselScreen`
 * when the `ticket_scan_v2` flag resolves true (the gate lives in
 * `app/journey/movie/[tmdbId].tsx`).
 *
 * Header (`JOURNEY X OF Y` mono accent + title + back), a horizontal card
 * carousel mirroring v1's FlatList of the movie's journeys (+ a v2-styled "Log
 * another viewing" trailing card), the Original / AI Art segmented toggle (only
 * when not flipped — reuses v1's `display_poster` optimistic write), and dot
 * pagination.
 *
 * Dark-only (built from `ScanV2Colors`/`ScanV2Accent`, never the theme-aware
 * `Colors`); text via `ScanText`, sizes via `s()`.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { hapticImpact, ImpactFeedbackStyle } from '@/lib/haptics';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { useAuth } from '@/hooks/use-auth';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { useJourneysByMovie, useJourneyMutations } from '@/hooks/use-journey';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { JourneyAIGenerationButton } from '@/components/journey/journey-ai-generation-button';
import { UpgradePromptSheet } from '@/components/premium/upgrade-prompt-sheet';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import type { UserMovie } from '@/lib/database.types';
import { Icon, ScanText } from './primitives';
import { JourneyCard } from './journey-card';
import type { AvatarStackPerson } from './avatar-stack';

const HEADER_HEIGHT = 100;
const MAX_JOURNEY_WIDTH = 480;
const CAROUSEL_HORIZONTAL_PADDING = 16;

type CarouselItem = { type: 'journey'; journey: UserMovie } | { type: 'add' };

function showsAiPoster(journey: UserMovie): boolean {
  return journey.display_poster === 'ai_generated' && !!journey.ai_poster_url;
}

// Sparkle glyph (not in the shared Icon set) — drawn inline for the AI toggle.
function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l1.7 4.8L18.5 9.5 13.7 11.2 12 16l-1.7-4.8L5.5 9.5l4.8-1.7zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"
      />
    </Svg>
  );
}

export function JourneyScreenV2() {
  const router = useRouter();
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();

  const parsedTmdbId = tmdbId ? parseInt(tmdbId, 10) : undefined;

  const { data: journeyData, isLoading, isError } = useJourneysByMovie(parsedTmdbId);
  const journeys = useMemo(() => journeyData?.journeys ?? [], [journeyData?.journeys]);
  const firstTake = journeyData?.firstTake ?? null;
  const { updateJourney } = useJourneyMutations(parsedTmdbId);

  const { mutualFollows } = useMutualFollows(user?.id ?? '');
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [page, setPage] = useState(0);
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false);
  const carouselRef = useRef<FlatList<CarouselItem>>(null);

  // name -> avatar lookup from mutual follows (same source as the v1 edit screen)
  const friendAvatarMap = useMemo(() => {
    const map = new Map<string, AvatarStackPerson>();
    for (const p of mutualFollows) {
      const name = (p.full_name || p.username || '').toLowerCase();
      if (name) {
        map.set(name, {
          name: p.full_name || p.username || name,
          userId: p.id,
          avatarUrl: buildAvatarUrl(p.avatar_url, p.updated_at),
          updatedAt: p.updated_at,
        });
      }
    }
    return map;
  }, [mutualFollows]);

  const resolveCompanions = useCallback(
    (journey: UserMovie): AvatarStackPerson[] =>
      (journey.watched_with ?? []).map((name) => {
        const match = friendAvatarMap.get(name.toLowerCase());
        return match ?? { name };
      }),
    [friendAvatarMap],
  );

  // Dimensions — mirror v1's carousel sizing.
  const screenWidth = Math.min(windowWidth, MAX_JOURNEY_WIDTH);
  const pageWidth = screenWidth;
  const isLandscape = windowWidth > screenHeight;
  const ticketHeight = Math.min(
    screenHeight - HEADER_HEIGHT - insets.top - insets.bottom - s(16) * 2,
    screenHeight * (isLandscape ? 0.88 : 0.8),
  );
  const totalPages = journeys.length + 1;

  const carouselData: CarouselItem[] = useMemo(() => {
    const items: CarouselItem[] = journeys.map((journey) => ({ type: 'journey' as const, journey }));
    items.push({ type: 'add' as const });
    return items;
  }, [journeys]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
      setFlipped(false);
      setPage(0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: pageWidth, offset: pageWidth * index, index }),
    [pageWidth],
  );

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const handleCreateJourney = useCallback(() => {
    requireAuth(() => {
      if (journeys.length === 0 || !parsedTmdbId) return;
      router.push(`/journey/edit/new?tmdbId=${parsedTmdbId}` as never);
    }, 'Sign in to log another viewing');
  }, [requireAuth, journeys.length, parsedTmdbId, router]);

  // Reuse v1's optimistic display_poster write.
  const handleTogglePoster = useCallback(
    async (journey: UserMovie) => {
      const newDisplayPoster = journey.display_poster === 'ai_generated' ? 'original' : 'ai_generated';
      try {
        await updateJourney({ journeyId: journey.id, data: { display_poster: newDisplayPoster } });
        if (newDisplayPoster === 'ai_generated') {
          const isHolographic = journey.ai_poster_rarity === 'holographic';
          Toast.show({
            type: 'success',
            text1: isHolographic ? '🌟 Rare art set as poster' : '✨ AI art set as poster',
            text2: 'This artwork will display in your collection',
          });
        }
      } catch {
        // optimistic update rolls back via the mutation's onError
      }
    },
    [updateJourney],
  );

  const renderItem = useCallback(
    ({ item }: { item: CarouselItem }) => {
      if (item.type === 'add') {
        return (
          <View style={{ width: pageWidth, paddingHorizontal: s(CAROUSEL_HORIZONTAL_PADDING) }}>
            <Pressable
              onPress={handleCreateJourney}
              style={{
                height: ticketHeight,
                borderRadius: s(22),
                borderWidth: 1.5,
                borderColor: ScanV2Colors.lineHi,
                backgroundColor: ScanV2Colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: s(24),
                gap: s(14),
              }}
            >
              <View
                style={{
                  width: s(72),
                  height: s(72),
                  borderRadius: 999,
                  backgroundColor: ScanV2Accent.soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="plus" size={s(34)} color={ScanV2Accent.primary} />
              </View>
              <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(19), color: ScanV2Colors.text }}>
                Log another viewing
              </ScanText>
              <ScanText
                style={{
                  fontFamily: Fonts.inter.regular,
                  fontSize: s(13.5),
                  color: ScanV2Colors.sec,
                  textAlign: 'center',
                }}
              >
                Add a new journey for this movie
              </ScanText>
            </Pressable>
          </View>
        );
      }

      return (
        <View style={{ width: pageWidth, paddingHorizontal: s(CAROUSEL_HORIZONTAL_PADDING) }}>
          <JourneyCard
            journey={item.journey}
            firstTake={firstTake}
            companions={resolveCompanions(item.journey)}
            showAi={showsAiPoster(item.journey)}
            flipped={flipped}
            onFlip={() => {
              setFlipped((v) => !v);
              hapticImpact(ImpactFeedbackStyle.Light);
            }}
            page={page}
            setPage={setPage}
            onEdit={() => router.push(`/journey/edit/${item.journey.id}` as never)}
            height={ticketHeight}
          />
        </View>
      );
    },
    [pageWidth, ticketHeight, handleCreateJourney, firstTake, resolveCompanions, flipped, page, router],
  );

  const movieTitle = journeys[0]?.title ?? 'Movie';
  const currentJourney = currentIndex < journeys.length ? journeys[currentIndex] : null;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: ScanV2Colors.bg, alignItems: 'center', justifyContent: 'center', gap: s(12) }}>
        <ActivityIndicator size="large" color={ScanV2Accent.primary} />
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), color: ScanV2Colors.sec }}>
          Loading your journeys…
        </ScanText>
      </View>
    );
  }

  if (isError || journeys.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: ScanV2Colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(24), gap: s(10) }}>
        <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(20), color: ScanV2Colors.text }}>
          No journeys found
        </ScanText>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), color: ScanV2Colors.sec, textAlign: 'center' }}>
          You have not logged any viewings for this movie yet.
        </ScanText>
        <Pressable
          onPress={handleGoBack}
          style={{ marginTop: s(8), paddingVertical: s(10), paddingHorizontal: s(20), borderRadius: 999, backgroundColor: ScanV2Accent.primary }}
        >
          <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(15), color: ScanV2Accent.on }}>Go back</ScanText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: ScanV2Colors.bg }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(10),
          paddingTop: insets.top + s(8),
          paddingBottom: s(8),
          paddingHorizontal: s(16),
        }}
      >
        <Pressable
          onPress={handleGoBack}
          style={{
            width: s(38),
            height: s(38),
            borderRadius: 999,
            backgroundColor: ScanV2Colors.field,
            borderWidth: 1,
            borderColor: ScanV2Colors.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrowL" size={s(19)} color={ScanV2Colors.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <ScanText
            style={{
              fontFamily: Fonts.mono.bold,
              fontSize: s(10),
              letterSpacing: 2,
              color: ScanV2Accent.primary,
            }}
          >
            {currentIndex >= journeys.length ? 'NEW JOURNEY' : `JOURNEY ${currentIndex + 1} OF ${journeys.length}`}
          </ScanText>
          <ScanText
            numberOfLines={1}
            style={{
              fontFamily: Fonts.outfit.bold,
              fontSize: s(17),
              color: ScanV2Colors.text,
              marginTop: s(1),
            }}
          >
            {movieTitle}
          </ScanText>
        </View>
        <View style={{ width: s(38) }} />
      </View>

      {/* Carousel */}
      <FlatList
        ref={carouselRef}
        data={carouselData}
        renderItem={renderItem}
        keyExtractor={(item, index) => (item.type === 'journey' ? item.journey.id : `add-${index}`)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        bounces={false}
        style={{ flexGrow: 0, width: screenWidth, alignSelf: 'center' }}
        initialNumToRender={totalPages}
      />

      {/* Original / AI toggle OR AI-generation button (current journey only, not flipped) */}
      {currentJourney && !flipped ? (
        <View style={{ width: screenWidth, alignSelf: 'center', paddingHorizontal: s(16), marginTop: s(16) }}>
          {currentJourney.ai_poster_url ? (
            <View
              style={{
                flexDirection: 'row',
                padding: s(4),
                backgroundColor: ScanV2Colors.field,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: ScanV2Colors.line,
              }}
            >
              {([
                ['original', 'Original'],
                ['ai', 'AI Art'],
              ] as const).map(([variant, label]) => {
                const on =
                  variant === 'ai' ? showsAiPoster(currentJourney) : !showsAiPoster(currentJourney);
                const wouldChange = variant === 'ai' ? !showsAiPoster(currentJourney) : showsAiPoster(currentJourney);
                return (
                  <Pressable
                    key={variant}
                    onPress={() => wouldChange && handleTogglePoster(currentJourney)}
                    style={{
                      flex: 1,
                      minHeight: s(40),
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: s(6),
                      backgroundColor: on
                        ? variant === 'ai'
                          ? ScanV2Accent.primary
                          : ScanV2Colors.cardHi
                        : 'transparent',
                    }}
                  >
                    {variant === 'ai' ? (
                      <Sparkle size={s(15)} color={on ? ScanV2Accent.on : ScanV2Colors.sec} />
                    ) : null}
                    <ScanText
                      style={{
                        fontFamily: Fonts.inter.semibold,
                        fontSize: s(14),
                        color: on ? (variant === 'ai' ? ScanV2Accent.on : ScanV2Colors.text) : ScanV2Colors.sec,
                      }}
                    >
                      {label}
                    </ScanText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <JourneyAIGenerationButton
              journeyId={currentJourney.id}
              movieTitle={currentJourney.title}
              genreIds={currentJourney.genre_ids}
              posterPath={currentJourney.poster_path}
              onUpgradePress={() => setUpgradeSheetVisible(true)}
            />
          )}
        </View>
      ) : null}

      {/* Dots */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: s(8),
          paddingTop: s(16),
          paddingBottom: insets.bottom + s(16),
        }}
      >
        {Array.from({ length: totalPages }).map((_, index) => (
          <View
            key={index}
            style={{
              width: currentIndex === index ? s(24) : s(8),
              height: s(8),
              borderRadius: 999,
              backgroundColor:
                currentIndex === index
                  ? ScanV2Colors.text
                  : index === totalPages - 1
                    ? ScanV2Accent.soft
                    : ScanV2Colors.lineHi,
            }}
          />
        ))}
      </View>

      <LoginPromptModal visible={isLoginPromptVisible} onClose={hideLoginPrompt} message={loginPromptMessage} />
      <UpgradePromptSheet
        visible={upgradeSheetVisible}
        featureKey="ai_poster_generation"
        onClose={() => setUpgradeSheetVisible(false)}
      />
    </View>
  );
}

export default JourneyScreenV2;
