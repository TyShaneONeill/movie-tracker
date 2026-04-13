import React, { useState } from 'react';
import { View, useWindowDimensions, StyleSheet, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PopcornBag } from '@/components/popcorn/PopcornBag';
import { PopcornCountBadge } from '@/components/popcorn/PopcornCountBadge';
import { MilestonesGrid } from '@/components/popcorn/MilestonesGrid';
import { usePopcorn } from '@/hooks/use-popcorn';
import { useAchievements } from '@/hooks/use-achievements';

type Tab = 'bag' | 'milestones';

export default function PopcornScreen() {
  const { width, height } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>('bag');
  const { kernels, totalCount } = usePopcorn();
  const { progress } = useAchievements();

  return (
    <View style={styles.container}>
      {/* Always render bag in background so physics keeps running */}
      <View style={[styles.canvas, activeTab !== 'bag' && styles.hidden]}>
        <PopcornBag kernels={kernels} width={width} height={height} />
        <PopcornCountBadge count={totalCount} />
      </View>

      {activeTab === 'milestones' && (
        <SafeAreaView style={styles.milestonesContainer} edges={['bottom']}>
          <MilestonesGrid progress={progress} onPressMilestone={() => {}} />
        </SafeAreaView>
      )}

      {/* Bottom tab toggle */}
      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        <View style={styles.tabBarInner}>
          <Pressable
            style={[styles.tab, activeTab === 'bag' && styles.tabActive]}
            onPress={() => setActiveTab('bag')}
          >
            <Text style={[styles.tabText, activeTab === 'bag' && styles.tabTextActive]}>Bag</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'milestones' && styles.tabActive]}
            onPress={() => setActiveTab('milestones')}
          >
            <Text style={[styles.tabText, activeTab === 'milestones' && styles.tabTextActive]}>Milestones</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  canvas: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0, pointerEvents: 'none' },
  milestonesContainer: { flex: 1, marginBottom: 60 },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(13,13,13,0.9)',
  },
  tabBarInner: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 24, gap: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 20 },
  tabActive: { backgroundColor: 'rgba(245,215,110,0.15)' },
  tabText: { color: '#888', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#F5D76E' },
});
