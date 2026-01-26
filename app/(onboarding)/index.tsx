import { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useOnboarding } from '@/hooks/use-onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
    title: 'Welcome to CineTrak',
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

export default function OnboardingScreen() {
  const { effectiveTheme } = useTheme();
  const { completeOnboarding } = useOnboarding();
  const insets = useSafeAreaInsets();
  const colors = Colors[effectiveTheme];

  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  };

  const handleGetStarted = () => {
    router.push('/(onboarding)/profile-setup');
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={styles.slide}>
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
      {/* Skip button */}
      <View style={styles.header}>
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <ThemedText style={[styles.skipText, { color: colors.textSecondary }]}>
            Skip
          </ThemedText>
        </Pressable>
      </View>

      {/* Slides */}
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
        bounces={false}
      />

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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  skipButton: {
    padding: Spacing.sm,
  },
  skipText: {
    ...Typography.body.base,
    fontWeight: '500',
  },
  slide: {
    width: SCREEN_WIDTH,
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
