import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Typography } from '@/constants/typography';
import { useStatsColors } from '@/constants/stats-v2-theme';
import { useUserStats } from '@/hooks/use-user-stats';
import { useAuth } from '@/hooks/use-auth';
import { usePremium } from '@/hooks/use-premium';
import { GuestSignInPrompt } from '@/components/guest-sign-in-prompt';
import { ContentContainer } from '@/components/content-container';
import { BannerAdComponent } from '@/components/ads/banner-ad';
import { StatsV2Header } from './stats-v2-header';
import { HeroStatCard } from './hero-stat-card';
import { YearGraph } from './year-graph';
import { GoingDeeper } from './going-deeper';
import { StatsV2Skeleton } from './stats-v2-skeleton';

const SKELETON_FADE_MS = 320;
const CONTENT_REVEAL_MS = 420;
const CONTENT_REVEAL_DELAY_MS = 60;

/**
 * Stats v2 home — analytics redesign foundation (vault PS-05, PR 1 of 4).
 *
 * PR 1 shipped the shell: header + membership pill (1A), the hero top-stats
 * card (1B), the first-run empty state (1G), the skeleton→content loading
 * cross-fade, and pull-to-refresh. PR 2 added the Your Year graph (1C) +
 * Top Genres (1D). PR 3 added Going deeper (1E) + the free-tier ad banner
 * (1F). PR 4 lands the gated detail screens the chips route to.
 */
export function StatsV2Screen() {
  const c = useStatsColors();
  const { user } = useAuth();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const { data: stats, isLoading, error, refetch } = useUserStats();
  const [refreshing, setRefreshing] = useState(false);

  // The skeleton shows on first load and replays on pull-to-refresh, then
  // cross-fades out while the content fades + lifts in.
  const loading = isLoading || refreshing;
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const skeletonOpacity = useRef(new Animated.Value(1)).current;
  const contentReveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) {
      setSkeletonMounted(true);
      skeletonOpacity.setValue(1);
      contentReveal.setValue(0);
      return;
    }
    Animated.timing(skeletonOpacity, {
      toValue: 0,
      duration: SKELETON_FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSkeletonMounted(false);
    });
    Animated.timing(contentReveal, {
      toValue: 1,
      duration: CONTENT_REVEAL_MS,
      delay: CONTENT_REVEAL_DELAY_MS,
      useNativeDriver: true,
    }).start();
  }, [loading, skeletonOpacity, contentReveal]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Guest state - show sign in prompt (same gate as v1)
  if (!user) {
    return (
      <GuestSignInPrompt
        icon="stats-chart-outline"
        title="Your Stats"
        message="Sign in to see your viewing statistics and movie insights"
      />
    );
  }

  // Error state (no cached data to fall back on)
  if (error && !stats) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]} edges={['top']}>
        <ContentContainer>
          <StatsV2Header />
        </ContentContainer>
        <View style={styles.errorContainer}>
          <Text style={[Typography.body.base, { color: c.text }]}>Failed to load stats</Text>
          <Text style={[Typography.body.sm, { color: c.sec, marginTop: 8 }]}>{error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty =
    !stats || (stats.summary.totalWatched === 0 && stats.summary.totalTvWatched === 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        bounces={Platform.OS !== 'web'}
        overScrollMode={Platform.OS === 'web' ? 'never' : 'auto'}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.stat.movies}
            />
          ) : undefined
        }
      >
        <ContentContainer>
          <View>
            <Animated.View
              pointerEvents={loading ? 'none' : 'auto'}
              style={{
                opacity: contentReveal,
                transform: [
                  {
                    translateY: contentReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              }}
            >
              <StatsV2Header />
              <HeroStatCard summary={stats?.summary} empty={isEmpty} />
              {/* Your Year graph (1C) + Top Genres (1D) — the card hides
                  itself entirely when the user has 0 logged this year. */}
              <YearGraph
                monthlyActivity={stats?.monthlyActivity ?? []}
                genres={stats?.genres ?? []}
              />
              {/* Going deeper (1E) — teaser/insight chips. Still shows in
                  the first-run empty state (it's the premium teaser). */}
              <GoingDeeper
                loggedCount={
                  (stats?.summary.totalWatched ?? 0) + (stats?.summary.totalTvWatched ?? 0)
                }
              />
              {/* Ad banner (1F) — free users only. The ads context already
                  suppresses ads for members (PremiumProvider flips adsEnabled
                  off, so BannerAdComponent self-hides via adsReady), but the
                  gate here keeps the guarantee local and race-free while
                  premium status is still resolving. */}
              {!premiumLoading && !isPremium && <BannerAdComponent placement="stats" />}
            </Animated.View>
            {skeletonMounted && (
              <Animated.View
                pointerEvents={loading ? 'auto' : 'none'}
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: skeletonOpacity, backgroundColor: c.bg },
                ]}
              >
                <StatsV2Skeleton />
              </Animated.View>
            )}
          </View>
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 110, // clears the floating tab bar
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
