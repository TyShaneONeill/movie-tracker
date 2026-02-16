/**
 * Lists Screen
 * Displays user's lists and liked lists in 2-column grid
 * Reference: ui-mocks/lists.html
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ListCard } from '@/components/cards/list-card';
import { CreateListModal } from '@/components/modals/create-list-modal';
import { useUserLists } from '@/hooks/use-user-lists';
import { useListMutations } from '@/hooks/use-list-mutations';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import Svg, { Path, Line } from 'react-native-svg';

// Chevron Left Icon
function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

// Plus Icon
function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export default function ListsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { data: lists, isLoading } = useUserLists();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { createList } = useListMutations();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  };

  const handleCreateList = () => setShowCreateModal(true);

  const handleCreate = async (data: { name: string; description: string; isPublic: boolean }) => {
    await createList({ name: data.name, description: data.description || undefined, isPublic: data.isPublic });
  };

  const handleListPress = (listId: string) => {
    router.push(`/list/${listId}`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ChevronLeftIcon color={colors.text} />
            </Pressable>
            <Text style={[Typography.display.h4, { color: colors.text }]}>My Lists</Text>
          </View>
          <Pressable
            onPress={handleCreateList}
            style={({ pressed }) => [
              styles.addButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <PlusIcon color={colors.text} />
          </Pressable>
        </View>

        {/* User's Lists Grid */}
        <View style={styles.listGrid}>
          {/* Create List Card */}
          <Pressable
            onPress={handleCreateList}
            style={({ pressed }) => [
              styles.createListCard,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.createIconCircle,
                { backgroundColor: colors.card },
              ]}
            >
              <PlusIcon color={colors.text} />
            </View>
            <Text style={[Typography.body.sm, styles.createText, { color: colors.textSecondary }]}>
              Create List
            </Text>
          </Pressable>

          {/* User Lists */}
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.tint} style={{ marginTop: Spacing.lg }} />
          ) : lists && lists.length > 0 ? (
            lists.map((list) => (
              <ListCard
                key={list.id}
                title={list.name}
                description={list.description}
                movieCount={list.movie_count}
                posterUrls={list.movies
                  .slice(0, 4)
                  .map((m) => getTMDBImageUrl(m.poster_path, 'w342'))
                  .filter((url): url is string => url !== null)}
                onPress={() => handleListPress(list.id)}
              />
            ))
          ) : null}
        </View>
      </ScrollView>
      <CreateListModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
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
    paddingHorizontal: Spacing.md,
    paddingBottom: 90, // Extra padding for floating nav bar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  createListCard: {
    width: '48%',
    height: 220,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  createText: {
    fontWeight: '600',
  },
});
