import React from 'react';
import { View, FlatList, ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { SectionHeader } from '@/components/ui/section-header';
import { SuggestedUserCard } from './SuggestedUserCard';
import { useSuggestedUsers } from '@/hooks/use-suggested-users';

export function SuggestedUsersSection() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { suggestions, isLoading } = useSuggestedUsers();

  if (!isLoading && suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Suggested for You" />
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          horizontal
          data={suggestions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SuggestedUserCard user={item} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
  },
  loadingContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: Spacing.xs,
  },
});
