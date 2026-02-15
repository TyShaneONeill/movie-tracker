/**
 * Achievements Screen
 *
 * Full-screen horizontal carousel of achievements.
 * Navigate here with: router.push({ pathname: '/achievements', params: { index: String(index) } })
 *
 * Features:
 * - Horizontal FlatList with snap-to-card behavior
 * - Cards show ~85% screen width with peek of adjacent cards
 * - Unlocked achievements show accent color + checkmark + date
 * - Locked achievements are dimmed with "how to earn" hints
 * - Dot indicators at the bottom for current position
 */

import React, { useMemo, useRef, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAchievements } from '@/hooks/use-achievements';
import { ThemedText } from '@/components/themed-text';
import type { Achievement } from '@/lib/database.types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_MARGIN = (SCREEN_WIDTH - CARD_WIDTH) / 2;

/**
 * Get a hint for how to earn a locked achievement based on its criteria.
 */
function getEarnHint(criteriaType: string, criteriaValue: number): string {
  switch (criteriaType) {
    case 'first_take_count':
      if (criteriaValue === 1) return 'Post your first movie review';
      return `Post ${criteriaValue} movie reviews`;
    case 'watched_count':
      return `Watch ${criteriaValue} movies`;
    case 'night_owl':
      return 'Log a movie between midnight and 5 AM';
    case 'genre_count':
      return `Watch movies across ${criteriaValue} different genres`;
    default:
      return 'Keep using CineTrak to unlock';
  }
}

/**
 * Format a date string for display.
 */
function formatUnlockedDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AchievementsScreen() {
  const { index } = useLocalSearchParams<{ index: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { achievements, userAchievements } = useAchievements();

  const initialIndex = Math.max(0, parseInt(index || '0', 10));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const getItemLayout = useCallback(
    (_data: unknown, itemIndex: number) => ({
      length: CARD_WIDTH,
      offset: CARD_WIDTH * itemIndex,
      index: itemIndex,
    }),
    []
  );

  const renderCard = useCallback(
    ({ item }: { item: Achievement }) => {
      const earned = userAchievements.some(
        (ua) => ua.achievement.id === item.id
      );
      const earnedAt = userAchievements.find(
        (ua) => ua.achievement.id === item.id
      )?.unlocked_at;

      return (
        <View style={styles.cardWrapper}>
          <View
            style={[
              styles.card,
              !earned && styles.cardLocked,
            ]}
          >
            {/* Icon circle */}
            <View
              style={[
                styles.iconCircle,
                earned
                  ? { backgroundColor: colors.tint + '20' }
                  : { backgroundColor: colors.textTertiary + '15' },
              ]}
            >
              <ThemedText style={styles.iconEmoji}>{item.icon}</ThemedText>
            </View>

            {/* Achievement name */}
            <ThemedText
              style={[
                styles.achievementName,
                { color: earned ? colors.text : colors.textSecondary },
              ]}
            >
              {item.name}
            </ThemedText>

            {/* Achievement description */}
            <ThemedText
              style={[
                styles.achievementDescription,
                { color: earned ? colors.textSecondary : colors.textTertiary },
              ]}
            >
              {item.description}
            </ThemedText>

            {/* Status indicator */}
            <View style={styles.statusContainer}>
              {earned ? (
                <>
                  <View
                    style={[
                      styles.checkBadge,
                      { backgroundColor: colors.tint },
                    ]}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                  <ThemedText
                    style={[styles.statusText, { color: colors.tint }]}
                  >
                    Unlocked
                  </ThemedText>
                  {earnedAt && (
                    <ThemedText
                      style={[
                        styles.dateText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {formatUnlockedDate(earnedAt)}
                    </ThemedText>
                  )}
                </>
              ) : (
                <>
                  <Ionicons
                    name="lock-closed"
                    size={20}
                    color={colors.textTertiary}
                  />
                  <ThemedText
                    style={[
                      styles.statusText,
                      { color: colors.textTertiary },
                    ]}
                  >
                    Not yet earned
                  </ThemedText>
                  <ThemedText
                    style={[styles.hintText, { color: colors.textTertiary }]}
                  >
                    {getEarnHint(item.criteria_type, item.criteria_value)}
                  </ThemedText>
                </>
              )}
            </View>
          </View>
        </View>
      );
    },
    [userAchievements, colors, styles]
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>
          Achievements
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={achievements}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
        getItemLayout={getItemLayout}
        initialScrollIndex={
          achievements.length > 0
            ? Math.min(initialIndex, achievements.length - 1)
            : undefined
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Page indicator dots */}
      {achievements.length > 0 && (
        <View style={styles.dotsContainer}>
          {achievements.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === activeIndex ? colors.tint : colors.border,
                },
              ]}
            />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    backButton: {
      width: 40,
      padding: Spacing.xs,
    },
    headerTitle: {
      flex: 1,
      ...Typography.body.lg,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 40,
    },
    carouselContent: {
      paddingHorizontal: CARD_MARGIN,
      alignItems: 'center',
    },
    cardWrapper: {
      width: CARD_WIDTH,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: Spacing.xl,
    },
    card: {
      width: CARD_WIDTH - Spacing.lg,
      backgroundColor: colors.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    cardLocked: {
      opacity: 0.55,
      backgroundColor: colors.backgroundSecondary,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconEmoji: {
      fontSize: 36,
      lineHeight: 44,
    },
    achievementName: {
      ...Typography.display.h3,
      textAlign: 'center',
    },
    achievementDescription: {
      ...Typography.body.base,
      textAlign: 'center',
    },
    statusContainer: {
      alignItems: 'center',
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    checkBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusText: {
      ...Typography.body.smMedium,
    },
    dateText: {
      ...Typography.body.xs,
    },
    hintText: {
      ...Typography.body.sm,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: Spacing.lg,
      gap: Spacing.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });
