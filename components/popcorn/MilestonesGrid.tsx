import React from 'react';
import { SectionList, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { AchievementGridCard } from '@/components/achievement-grid-card';
import type { AchievementProgress } from '@/lib/achievement-service';

const CATEGORY_LABELS: Record<string, string> = {
  movies: 'Movies',
  tv: 'TV Shows',
  kernel_milestones: 'Kernel Milestones',
};

interface Props {
  progress: AchievementProgress[];
  onPressMilestone: (progress: AchievementProgress) => void;
}

export function MilestonesGrid({ progress, onPressMilestone }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 48) / 3;

  // Group by category — use achievement.category field
  const sections = Object.entries(
    progress.reduce((acc, p) => {
      const cat = (p.achievement as any).category ?? 'movies';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {} as Record<string, AchievementProgress[]>)
  ).map(([category, data]) => ({
    title: CATEGORY_LABELS[category] ?? category,
    data: [data], // SectionList expects rows; wrap in array for grid layout
  }));

  return (
    <SectionList
      sections={sections}
      keyExtractor={(_, i) => String(i)}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item: rowItems }) => (
        <View style={styles.row}>
          {rowItems.map((p) => (
            <AchievementGridCard
              key={p.achievement.id}
              progress={p}
              cardWidth={cardWidth}
              onPress={() => onPressMilestone(p)}
            />
          ))}
        </View>
      )}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionHeader: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8, color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
});
