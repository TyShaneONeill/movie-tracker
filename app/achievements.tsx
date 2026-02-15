import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAchievements } from '@/hooks/use-achievements';
import { ThemedText } from '@/components/themed-text';
import { AchievementGridCard } from '@/components/achievement-grid-card';
import type { AchievementProgress } from '@/lib/achievement-service';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_COUNT = 3;
const GRID_GAP = Spacing.sm;
const HORIZONTAL_PADDING = Spacing.lg;
const AVAILABLE_WIDTH = SCREEN_WIDTH - (HORIZONTAL_PADDING * 2);
const CARD_WIDTH = (AVAILABLE_WIDTH - (GRID_GAP * (COLUMN_COUNT - 1))) / COLUMN_COUNT;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

export default function AchievementsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { progress } = useAchievements();
  const [selectedProgress, setSelectedProgress] = useState<AchievementProgress | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const renderCard = useCallback(
    ({ item }: { item: AchievementProgress }) => (
      <AchievementGridCard
        progress={item}
        cardWidth={CARD_WIDTH}
        onPress={() => setSelectedProgress(item)}
      />
    ),
    []
  );

  const currentLevelData = selectedProgress
    ? selectedProgress.levels.find(l => l.level === selectedProgress.currentLevel)
    : null;

  const nextLevelData = selectedProgress
    ? selectedProgress.levels.find(l => l.level === 1)
    : null;

  const detailImageUrl = currentLevelData?.image_url ?? null;

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

      {/* Grid */}
      <FlatList
        data={progress}
        keyExtractor={(item) => item.achievement.id}
        renderItem={renderCard}
        numColumns={COLUMN_COUNT}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Detail Modal */}
      {selectedProgress && (
        <Modal
          visible={!!selectedProgress}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setSelectedProgress(null)}
        >
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <SafeAreaView style={styles.modalSafeArea}>
              {/* Close button */}
              <Pressable
                onPress={() => setSelectedProgress(null)}
                style={({ pressed }) => [
                  styles.closeButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Ionicons name="close" size={28} color={colors.text} />
              </Pressable>

              <ScrollView
                contentContainerStyle={styles.modalContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Large centered icon/image */}
                <View style={[styles.detailIconContainer, { borderColor: colors.tint }]}>
                  {detailImageUrl ? (
                    <Image
                      source={{ uri: detailImageUrl }}
                      style={styles.detailImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <ThemedText style={styles.detailEmoji}>
                      {selectedProgress.achievement.icon}
                    </ThemedText>
                  )}
                </View>

                {/* Date badge - only if earned */}
                {selectedProgress.currentLevel > 0 && selectedProgress.latestUnlockedAt && (
                  <View style={[styles.dateBadge, { backgroundColor: colors.card }]}>
                    <ThemedText style={[styles.dateText, { color: colors.gold }]}>
                      {formatDate(selectedProgress.latestUnlockedAt)}
                    </ThemedText>
                  </View>
                )}

                {/* Achievement name */}
                <ThemedText style={[styles.detailName, { color: colors.text }]}>
                  {selectedProgress.achievement.name}
                </ThemedText>

                {/* Level-specific description */}
                <ThemedText style={[styles.detailDescription, { color: colors.textSecondary }]}>
                  {selectedProgress.currentLevel > 0 && currentLevelData
                    ? currentLevelData.description
                    : selectedProgress.achievement.description}
                </ThemedText>

                {/* Level progression row */}
                <View style={styles.levelRow}>
                  {selectedProgress.levels.map((level) => {
                    const isEarned = selectedProgress.earnedLevels.includes(level.level);
                    return (
                      <View
                        key={level.id}
                        style={[
                          styles.levelDot,
                          {
                            backgroundColor: isEarned ? colors.tint : 'transparent',
                            borderColor: isEarned ? colors.tint : colors.border,
                          },
                        ]}
                      />
                    );
                  })}
                </View>

                {/* Not yet earned hint */}
                {selectedProgress.currentLevel === 0 && nextLevelData && (
                  <View style={styles.hintContainer}>
                    <ThemedText style={[styles.notEarnedText, { color: colors.textTertiary }]}>
                      Not yet earned
                    </ThemedText>
                    <ThemedText style={[styles.hintText, { color: colors.textTertiary }]}>
                      {nextLevelData.description}
                    </ThemedText>
                  </View>
                )}
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const DETAIL_ICON_SIZE = 120;

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
    gridContent: {
      paddingHorizontal: HORIZONTAL_PADDING,
      paddingTop: Spacing.md,
      paddingBottom: 100,
    },
    columnWrapper: {
      gap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    // Detail modal
    modalContainer: {
      flex: 1,
    },
    modalSafeArea: {
      flex: 1,
    },
    closeButton: {
      position: 'absolute',
      top: Spacing.md,
      left: Spacing.md,
      zIndex: 10,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      alignItems: 'center',
      paddingTop: 80,
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xl,
    },
    detailIconContainer: {
      width: DETAIL_ICON_SIZE,
      height: DETAIL_ICON_SIZE,
      borderRadius: DETAIL_ICON_SIZE / 2,
      backgroundColor: colors.card,
      borderWidth: 3,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    detailImage: {
      width: DETAIL_ICON_SIZE,
      height: DETAIL_ICON_SIZE,
    },
    detailEmoji: {
      fontSize: 56,
      lineHeight: 64,
    },
    dateBadge: {
      marginTop: Spacing.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
    },
    dateText: {
      ...Typography.body.xsMedium,
      letterSpacing: 1,
    },
    detailName: {
      ...Typography.display.h2,
      textAlign: 'center',
      marginTop: Spacing.md,
    },
    detailDescription: {
      ...Typography.body.base,
      textAlign: 'center',
      marginTop: Spacing.sm,
      paddingHorizontal: Spacing.md,
    },
    levelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
    },
    levelDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
    },
    hintContainer: {
      marginTop: Spacing.lg,
      alignItems: 'center',
      gap: Spacing.xs,
    },
    notEarnedText: {
      ...Typography.body.smMedium,
    },
    hintText: {
      ...Typography.body.sm,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
