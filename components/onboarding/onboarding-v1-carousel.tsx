import { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  ViewToken,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { ContentContainer } from '@/components/content-container';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useWideLayout, MAX_CONTENT_WIDTH } from '@/hooks/use-wide-layout';


interface OnboardingSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description: string;
  gradient: readonly [string, string, ...string[]];
}

const SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    icon: 'film',
    iconColor: '#fff',
    title: 'Welcome to PocketStubs',
    description: 'Your personal movie companion. Track what you watch, capture your reactions, and discover your viewing habits.',
    gradient: ['#e11d48', '#be123c'] as const,
  },
  {
    id: 'tracking',
    icon: 'bookmark',
    iconColor: '#fff',
    title: 'Track Your Movies',
    description: 'Build your watchlist, mark what you\'re currently watching, and keep a record of everything you\'ve seen.',
    gradient: ['#6366f1', '#8b5cf6'] as const,
  },
  {
    id: 'first-takes',
    icon: 'chatbubble-ellipses',
    iconColor: '#fff',
    title: 'Capture First Takes',
    description: 'Record your immediate thoughts right after watching. Your raw, unfiltered reactions preserved forever.',
    gradient: ['#f59e0b', '#ef4444'] as const,
  },
  {
    id: 'scanner',
    icon: 'scan',
    iconColor: '#fff',
    title: 'Scan Theater Tickets',
    description: 'Snap a photo of your movie ticket to instantly log your theater visit. No manual entry needed.',
    gradient: ['#10b981', '#059669'] as const,
  },
  {
    id: 'stats',
    icon: 'stats-chart',
    iconColor: '#fff',
    title: 'Discover Your Stats',
    description: 'See your genre preferences, monthly activity, and watch history visualized in beautiful charts.',
    gradient: ['#3b82f6', '#1d4ed8'] as const,
  },
];

export function OnboardingV1Carousel() {
  const { effectiveTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { isWide } = useWideLayout();
  const colors = Colors[effectiveTheme];

  // On wide layouts (web/tablet), constrain slide width to the shared content max so
  // the FlatList carousel matches the rest of the app's centered 720px column.
  // Without this, slides render at full window width and content sits off to the side.
  const slideWidth = isWide ? Math.min(screenWidth, MAX_CONTENT_WIDTH) : screenWidth;

  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Captured via onLayout on the carousel wrapper. On native, FlatList items
  // inherit the container's height via flex:1 and content centers fine. On
  // react-native-web, horizontal-FlatList items don't inherit container height,
  // so each slide collapses to content height and `justifyContent: 'center'`
  // has nothing to center within — content sticks to the top with empty space
  // below. Reading the wrapper's actual height and applying it to each slide
  // gives the same vertical centering on web as on native.
  const [slideHeight, setSlideHeight] = useState<number | null>(null);

  const handleCarouselLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setSlideHeight(h);
  }, []);

  // Required for scrollToIndex to work properly on web
  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: slideWidth,
    offset: slideWidth * index,
    index,
  }), [slideWidth]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleGetStarted();
    }
  };

  const handleGetStarted = () => {
    router.push('/(onboarding)/profile-setup');
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View
      style={[
        styles.slide,
        { width: slideWidth },
        slideHeight !== null && { height: slideHeight },
      ]}
    >
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconContainer}
      >
        <Ionicons name={item.icon} size={64} color={item.iconColor} />
      </LinearGradient>

      <ThemedText style={[styles.title, { color: colors.text }]}>
        {item.title}
      </ThemedText>

      <ThemedText style={[styles.description, { color: colors.textSecondary }]}>
        {item.description}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Slides — constrained to MAX_CONTENT_WIDTH on web/tablet so the carousel
          centers within the shared content column instead of sprawling full-window. */}
      <View
        style={[styles.flatListContainer, isWide && styles.flatListContainerWide]}
        onLayout={handleCarouselLayout}
      >
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          bounces={false}
        />
      </View>

      <ContentContainer>
        {/* Pagination dots */}
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: index === currentIndex
                    ? colors.tint
                    : colors.border,
                  width: index === currentIndex ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Navigation buttons */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          {isLastSlide ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleGetStarted}
            >
              <ThemedText style={styles.primaryButtonText}>Get Started</ThemedText>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleNext}
            >
              <ThemedText style={styles.primaryButtonText}>Next</ThemedText>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </ContentContainer>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flatListContainer: {
    flex: 1,
  },
  flatListContainerWide: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    ...Typography.display.h2,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.body.lg,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 56,
    borderRadius: BorderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
