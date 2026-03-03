/**
 * Streaming Services Picker Screen
 * Allows users to select which streaming services they subscribe to.
 * Pushed from profile/settings, not inside tabs.
 */

import { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';

import {
  useAvailableProviders,
  useUserStreamingServices,
  useToggleStreamingService,
} from '@/hooks/use-streaming-services';
import type { StreamingProvider } from '@/lib/streaming-service';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

const NUM_COLUMNS = 3;
const LOGO_SIZE = 48;
const TILE_SIZE = 100;

export default function StreamingServicesScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Data
  const { data: providers, isLoading: providersLoading } = useAvailableProviders();
  const { data: userServices } = useUserStreamingServices();
  const toggleMutation = useToggleStreamingService();

  // Build a set of selected provider IDs for quick lookup
  const selectedIds = useMemo(() => {
    const set = new Set<number>();
    if (userServices) {
      for (const s of userServices) {
        set.add(s.provider_id);
      }
    }
    return set;
  }, [userServices]);

  // Toggle handler
  const handleToggle = useCallback(
    (provider: StreamingProvider) => {
      const isSelected = selectedIds.has(provider.provider_id);
      toggleMutation.mutate({ provider, isSelected });
    },
    [selectedIds, toggleMutation]
  );

  // Render a single provider tile
  const renderItem = useCallback(
    ({ item }: { item: StreamingProvider }) => {
      const isSelected = selectedIds.has(item.provider_id);
      return (
        <Pressable
          onPress={() => handleToggle(item)}
          style={[
            styles.tile,
            {
              backgroundColor: colors.card,
              borderColor: isSelected ? colors.tint : colors.border,
              borderWidth: isSelected ? 2 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${item.provider_name}${isSelected ? ', selected' : ''}`}
        >
          {/* Provider Logo */}
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w92${item.logo_path}` }}
            style={styles.logo}
            contentFit="cover"
            transition={200}
          />

          {/* Provider Name */}
          <Text
            style={[styles.providerName, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {item.provider_name}
          </Text>

          {/* Checkmark Badge */}
          {isSelected && (
            <View style={[styles.checkBadge, { backgroundColor: colors.tint }]}>
              <Ionicons name="checkmark" size={12} color="#ffffff" />
            </View>
          )}
        </Pressable>
      );
    },
    [selectedIds, handleToggle, colors]
  );

  const keyExtractor = useCallback(
    (item: StreamingProvider) => String(item.provider_id),
    []
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          My Streaming Services
        </Text>

        {/* Spacer to balance the back button */}
        <View style={styles.headerButton} />
      </View>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Select the services you subscribe to
      </Text>

      {/* Loading State */}
      {providersLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={providers}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.display.h4,
    fontSize: 20,
  },

  // Subtitle
  subtitle: {
    ...Typography.body.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Grid
  gridContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  gridRow: {
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },

  // Tile
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    flex: 1,
    maxWidth: TILE_SIZE + 20,
  },

  // Logo
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: BorderRadius.sm,
  },

  // Provider name
  providerName: {
    ...Typography.caption.default,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  // Checkmark badge
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
