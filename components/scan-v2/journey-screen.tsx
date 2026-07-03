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
 * another viewing" trailing card), and dot pagination centered between the
 * card and the home indicator. Every card renders at ONE identical height
 * derived from layout constants (poster ~2:3 + fixed stub) — never from data
 * or ad state. The Original|AI art control lives ON the card (segmented glass
 * pill); tapping AI with no art opens the on-demand `GenerateArtSheet`
 * (variant swaps reuse v1's `display_poster` optimistic write).
 *
 * Theme-aware (built from `useScanColors()`/`ScanV2Accent`, not the global theme
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
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useScanColors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { hapticImpact, ImpactFeedbackStyle } from '@/lib/haptics';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { useAuth } from '@/hooks/use-auth';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { useJourneysByMovie, useJourneyMutations, useCreateJourney } from '@/hooks/use-journey';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UpgradePromptSheet } from '@/components/premium/upgrade-prompt-sheet';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { PosterInspectionModal } from '@/components/poster-inspection';
import { resolveJourneyPhotoUrl } from '@/lib/ticket-photo-url';
import type { UserMovie } from '@/lib/database.types';
import { Icon, ScanText } from './primitives';
import { JourneyCard, JOURNEY_STUB_MIN_HEIGHT, JOURNEY_POSTER_ASPECT } from './journey-card';
import { EditJourneySheet } from './edit-journey-sheet';
import { GenerateArtSheet } from './generate-art-sheet';
import type { AvatarStackPerson } from './avatar-stack';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const MAX_JOURNEY_WIDTH = 480;
const CAROUSEL_HORIZONTAL_PADDING = 16;

type CarouselItem = { type: 'journey'; journey: UserMovie } | { type: 'add' };

function showsAiPoster(journey: UserMovie): boolean {
  return journey.display_poster === 'ai_generated' && !!journey.ai_poster_url;
}

export function JourneyScreenV2() {
  const router = useRouter();
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();
  const c = useScanColors();

  const parsedTmdbId = tmdbId ? parseInt(tmdbId, 10) : undefined;

  const { data: journeyData, isLoading, isError } = useJourneysByMovie(parsedTmdbId);
  const journeys = useMemo(() => journeyData?.journeys ?? [], [journeyData?.journeys]);
  const firstTake = journeyData?.firstTake ?? null;

  // Which journeys are scan-verified (a ticket_scans row backs them) — gates the
  // emerald "Verified" badge so manually-logged journeys read as plain "Theater visit".
  const journeyIds = useMemo(() => journeys.map((j) => j.id), [journeys]);
  const { data: scannedIds } = useQuery({
    queryKey: ['journeyScans', parsedTmdbId, user?.id, journeyIds.length],
    enabled: journeyIds.length > 0 && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('ticket_scans').select('journey_id').in('journey_id', journeyIds);
      return new Set(
        ((data ?? []) as { journey_id: string | null }[]).map((r) => r.journey_id).filter(Boolean) as string[],
      );
    },
  });
  const { updateJourney, deleteJourney } = useJourneyMutations(parsedTmdbId);
  const { createJourney, isCreating } = useCreateJourney();

  const { mutualFollows } = useMutualFollows(user?.id ?? '');
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [page, setPage] = useState(0);
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false);
  const [cardH, setCardH] = useState(0); // measured height of the flex card area (fills available space)
  const [posterModalVisible, setPosterModalVisible] = useState(false);
  const [inspectUri, setInspectUri] = useState('');
  const [inspectTitle, setInspectTitle] = useState('');
  const [editingJourney, setEditingJourney] = useState<UserMovie | null>(null);
  // Journey whose on-demand "Generate AI poster" sheet is open (AI segment
  // tapped with no AI art yet) — null when closed.
  const [generateJourney, setGenerateJourney] = useState<UserMovie | null>(null);
  // Set ONLY for a freshly-created-but-unsaved journey (the create flow). When it
  // matches the open sheet's journey, cancelling deletes the empty row so no blank
  // journey is left behind. The edit-pencil path leaves this null → never deletes.
  const [pendingCreateId, setPendingCreateId] = useState<string | null>(null);
  const carouselRef = useRef<FlatList<CarouselItem>>(null);
  const creatingRef = useRef(false); // synchronous re-entrancy guard for create (double-tap)

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

  // Tap the poster → full-screen 3D tilt inspector (reuses the v1 PosterInspectionModal),
  // with the ACTIVE poster image the card is showing (Original or AI — whichever is up).
  const handleInspectPoster = useCallback((uri: string, journey: UserMovie) => {
    if (!uri) return;
    setInspectTitle(journey.title);
    // Resolve/sign first — the inspector renders a raw <Image>, not SignedPhoto.
    setInspectUri('');
    void resolveJourneyPhotoUrl(uri).then(setInspectUri);
    setPosterModalVisible(true);
    hapticImpact(ImpactFeedbackStyle.Medium);
  }, []);

  // The card fills the measured space between the header and the dots strip
  // (`cardH`). EVERY card (journeys + "Log another viewing") renders at this ONE
  // height — geometry derives only from layout constants, never data or state,
  // so the perforation seam and stub never jump while swiping.
  const screenWidth = Math.min(windowWidth, MAX_JOURNEY_WIDTH);
  const pageWidth = screenWidth;
  const ticketHeight = cardH;
  const totalPages = journeys.length + 1;

  // Fixed stub-slab height: give the poster a full ~2:3 region when the viewport
  // allows, and never let the stub shrink below its minimum. Identical for every
  // card — the seam Y is a per-device constant.
  const cardWidth = pageWidth - 2 * s(CAROUSEL_HORIZONTAL_PADDING);
  const stubHeight = Math.max(
    s(JOURNEY_STUB_MIN_HEIGHT),
    ticketHeight - Math.round(cardWidth * JOURNEY_POSTER_ASPECT),
  );

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

  // Create the row FIRST (so the edit sheet's photo upload has a real journey.id),
  // then open the same v2 EditJourneySheet on it. `journeys[0]` is the metadata
  // template — the create RPC derives movie identity + next journey_number from it;
  // all editable fields start null (the sheet seeds blank). Cancel cleans up via
  // pendingCreateId (see the sheet's onClose) so no empty journey is left behind.
  const handleCreateJourney = useCallback(() => {
    requireAuth(async () => {
      // Synchronous re-entrancy guard: `disabled={isCreating}` lags a render commit,
      // so a fast double-tap could fire two create RPCs (the first row orphaned). The
      // ref blocks the second tap immediately.
      if (creatingRef.current || !journeys[0]) return;
      creatingRef.current = true;
      try {
        const newJourney = await createJourney(journeys[0]);
        setPendingCreateId(newJourney.id);
        setEditingJourney(newJourney);
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Could not start a new journey',
          text2: 'Please try again.',
        });
      } finally {
        creatingRef.current = false;
      }
    }, 'Sign in to log another viewing');
  }, [requireAuth, journeys, createJourney]);

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

  // On-card Original|AI segmented pill. AI with no art yet → open the generate
  // sheet; otherwise a tap on the inactive side swaps the cover (active side is
  // a no-op).
  const handleSelectVariant = useCallback(
    (journey: UserMovie, variant: 'original' | 'ai') => {
      const aiActive = showsAiPoster(journey);
      if (variant === 'ai') {
        if (!journey.ai_poster_url) {
          hapticImpact(ImpactFeedbackStyle.Light);
          setGenerateJourney(journey);
          return;
        }
        if (!aiActive) void handleTogglePoster(journey);
      } else if (aiActive) {
        void handleTogglePoster(journey);
      }
    },
    [handleTogglePoster],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CarouselItem; index: number }) => {
      if (item.type === 'add') {
        return (
          <View style={{ width: pageWidth, paddingHorizontal: s(CAROUSEL_HORIZONTAL_PADDING) }}>
            <Pressable
              onPress={handleCreateJourney}
              disabled={isCreating}
              style={{
                height: ticketHeight,
                borderRadius: s(22),
                borderWidth: 1.5,
                borderColor: c.lineHi,
                backgroundColor: c.card,
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
                {isCreating ? (
                  <ActivityIndicator size="small" color={ScanV2Accent.primary} />
                ) : (
                  <Icon name="plus" size={s(34)} color={ScanV2Accent.primary} />
                )}
              </View>
              <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(19), color: c.text }}>
                Log another viewing
              </ScanText>
              <ScanText
                style={{
                  fontFamily: Fonts.inter.regular,
                  fontSize: s(13.5),
                  color: c.sec,
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
            flipped={flipped && index === currentIndex}
            onFlip={() => {
              setFlipped((v) => !v);
              hapticImpact(ImpactFeedbackStyle.Light);
            }}
            page={index === currentIndex ? page : 0}
            setPage={setPage}
            onEdit={() => setEditingJourney(item.journey)}
            onInspectPoster={handleInspectPoster}
            verified={scannedIds?.has(item.journey.id) ?? false}
            height={ticketHeight}
            stubHeight={stubHeight}
            onSelectVariant={(variant) => handleSelectVariant(item.journey, variant)}
          />
        </View>
      );
    },
    [c, pageWidth, ticketHeight, stubHeight, handleCreateJourney, isCreating, firstTake, resolveCompanions, flipped, page, currentIndex, handleInspectPoster, scannedIds, handleSelectVariant],
  );

  const movieTitle = journeys[0]?.title ?? 'Movie';

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: s(12) }}>
        <ActivityIndicator size="large" color={ScanV2Accent.primary} />
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), color: c.sec }}>
          Loading your journeys…
        </ScanText>
      </View>
    );
  }

  if (isError || journeys.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(24), gap: s(10) }}>
        <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(20), color: c.text }}>
          No journeys found
        </ScanText>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(14), color: c.sec, textAlign: 'center' }}>
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
    <View style={{ flex: 1, backgroundColor: c.bg }}>
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
            backgroundColor: c.field,
            borderWidth: 1,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrowL" size={s(19)} color={c.text} />
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
              color: c.text,
              marginTop: s(1),
            }}
          >
            {movieTitle}
          </ScanText>
        </View>
        <View style={{ width: s(38) }} />
      </View>

      {/* Carousel — the flex:1 wrapper fills the space between the header and the bottom
          controls; we measure it (cardH) and size the cards to fill, so the card is as
          tall as the device allows and the controls hug the bottom (no dead gap). */}
      <View style={{ flex: 1, width: '100%' }} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
        {cardH > 0 && (
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
            style={{ flexGrow: 0, width: screenWidth, alignSelf: 'center', height: ticketHeight }}
            initialNumToRender={totalPages}
          />
        )}
      </View>

      {/* Dots — vertically centered in the fixed strip between the card bottom
          and the OS home indicator (no bottom action bar anywhere) */}
      <View
        style={{
          height: s(52),
          marginBottom: insets.bottom,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: s(8),
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
                  ? c.text
                  : index === totalPages - 1
                    ? ScanV2Accent.soft
                    : c.lineHi,
            }}
          />
        ))}
      </View>

      <LoginPromptModal visible={isLoginPromptVisible} onClose={hideLoginPrompt} message={loginPromptMessage} />
      {generateJourney ? (
        <GenerateArtSheet
          journey={generateJourney}
          onClose={() => setGenerateJourney(null)}
          onUpgradePress={() => {
            setGenerateJourney(null);
            setUpgradeSheetVisible(true);
          }}
        />
      ) : null}
      <UpgradePromptSheet
        visible={upgradeSheetVisible}
        featureKey="ai_poster_generation"
        onClose={() => setUpgradeSheetVisible(false)}
      />
      <PosterInspectionModal
        visible={posterModalVisible}
        imageUrl={inspectUri}
        movieTitle={inspectTitle}
        onClose={() => setPosterModalVisible(false)}
      />
      {editingJourney ? (
        <EditJourneySheet
          journey={editingJourney}
          onClose={() => {
            // Cancel: if this is a freshly-created-but-never-saved row (create flow),
            // delete it so the carousel isn't left with an empty journey. The
            // edit-pencil path leaves pendingCreateId null → never deletes a real row.
            if (pendingCreateId && editingJourney && pendingCreateId === editingJourney.id) {
              deleteJourney(pendingCreateId).catch(() => {});
            }
            setPendingCreateId(null);
            setEditingJourney(null);
          }}
          onSave={(patch) => {
            updateJourney({ journeyId: editingJourney.id, data: patch }).catch(() => {
              // optimistic update rolls back via the mutation's onError — surface it
              // so the user knows the change didn't stick (v1 parity).
              Toast.show({ type: 'error', text1: 'Could not save changes', text2: 'Please try again.' });
            });
            // Saved → keep the row; clear the pending-create flag so a later Cancel
            // on a re-opened sheet never deletes it.
            setPendingCreateId(null);
            setEditingJourney(null);
          }}
        />
      ) : null}
    </View>
  );
}

export default JourneyScreenV2;
