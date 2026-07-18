import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ContentContainer, formWidthStyle } from '@/components/content-container';
import { captureException } from '@/lib/sentry';
import type { ReviewVisibility } from '@/lib/database.types';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export default function FeatureTogglesScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { preferences, isLoading: isLoadingPreferences, updatePreference, isUpdating } = useUserPreferences();

  const handleFirstTakePromptToggle = async (value: boolean) => {
    hapticImpact();
    try {
      await updatePreference('firstTakePromptEnabled', value);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-first-take-prompt-toggle' });
    }
  };

  const visibilityLabels: Record<ReviewVisibility, string> = {
    public: 'Public',
    followers_only: 'Followers Only',
    private: 'Private',
  };

  const visibilityCycle: Record<ReviewVisibility, ReviewVisibility> = {
    public: 'followers_only',
    followers_only: 'private',
    private: 'public',
  };

  const handleReviewVisibilityToggle = async () => {
    hapticImpact();
    const current = preferences?.reviewVisibility ?? 'public';
    const next = visibilityCycle[current];
    try {
      await updatePreference('reviewVisibility', next);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-review-visibility-toggle' });
    }
  };

  const collectionViewLabels: Record<string, string> = {
    movies: 'Movies',
    tv: 'TV Shows',
  };

  const handleCollectionViewToggle = async () => {
    hapticImpact();
    const current = preferences?.defaultCollectionView ?? 'movies';
    const next = current === 'movies' ? 'tv' : 'movies';
    try {
      await updatePreference('defaultCollectionView', next);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-collection-view-toggle' });
    }
  };

  const handleContinueWatchingToggle = async (value: boolean) => {
    hapticImpact();
    try {
      await updatePreference('showContinueWatching', value);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-continue-watching-toggle' });
    }
  };

  const handleCropTicketPhotosToggle = async (value: boolean) => {
    hapticImpact();
    try {
      await updatePreference('cropTicketPhotos', value);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-crop-ticket-photos-toggle' });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ContentContainer>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <ChevronLeftIcon color={colors.text} />
            </Pressable>
            <Text style={[Typography.display.h4, { color: colors.text }]}>Feature Toggles</Text>
          </View>

          <View style={styles.section}>
            <View
              style={[
                styles.settingsItem,
                styles.firstItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border }
              ]}
            >
              <View style={styles.settingsItemContent}>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Prompt for First Take</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Quick review after marking watched</Text>
              </View>
              <ToggleSwitch
                value={preferences?.firstTakePromptEnabled ?? true}
                onValueChange={handleFirstTakePromptToggle}
                disabled={isLoadingPreferences || isUpdating}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={handleReviewVisibilityToggle}
              disabled={isLoadingPreferences || isUpdating}
            >
              <View style={styles.settingsItemContent}>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Review Visibility</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Default visibility for First Takes</Text>
              </View>
              <Text style={[Typography.body.sm, { color: colors.tint }]}>
                {visibilityLabels[preferences?.reviewVisibility ?? 'public']}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={handleCollectionViewToggle}
              disabled={isLoadingPreferences || isUpdating}
            >
              <View style={styles.settingsItemContent}>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Collection View</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Default media type on profile</Text>
              </View>
              <Text style={[Typography.body.sm, { color: colors.tint }]}>
                {collectionViewLabels[preferences?.defaultCollectionView ?? 'movies']}
              </Text>
            </Pressable>

            <View
              style={[
                styles.settingsItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border }
              ]}
            >
              <View style={styles.settingsItemContent}>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Continue Watching</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Show section on home screen</Text>
              </View>
              <ToggleSwitch
                value={preferences?.showContinueWatching ?? true}
                onValueChange={handleContinueWatchingToggle}
                disabled={isLoadingPreferences || isUpdating}
              />
            </View>

            <View
              style={[
                styles.settingsItem,
                styles.lastItem,
                { backgroundColor: colors.card }
              ]}
            >
              <View style={styles.settingsItemContent}>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Crop ticket photos</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Experimental: crop scanned ticket photos to remove background</Text>
              </View>
              <ToggleSwitch
                value={preferences?.cropTicketPhotos ?? false}
                onValueChange={handleCropTicketPhotosToggle}
                disabled={isLoadingPreferences || isUpdating}
              />
            </View>
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
  scrollContent: {
    paddingBottom: 100,
    ...formWidthStyle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
  },
  section: {
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  settingsItem: {
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  settingsItemContent: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  firstItem: {
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
  },
  lastItem: {
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    borderBottomWidth: 0,
  },
});
