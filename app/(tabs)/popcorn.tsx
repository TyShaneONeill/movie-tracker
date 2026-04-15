import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PopcornBag } from '@/components/popcorn/PopcornBag';
import { PopcornCountBadge } from '@/components/popcorn/PopcornCountBadge';
import { MilestonesGrid } from '@/components/popcorn/MilestonesGrid';
import { usePopcorn } from '@/hooks/use-popcorn';
import { useAchievements } from '@/hooks/use-achievements';
import { useEffectiveColorScheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';
import { DEFAULT_PHYSICS_CONFIG } from '@/lib/physics-engine';

type Tab = 'bag' | 'milestones';

export default function PopcornScreen() {
  const scheme = useEffectiveColorScheme();
  const colors = Colors[scheme];
  const { width, height } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>('bag');
  const { kernels, totalCount } = usePopcorn();
  const { progress } = useAchievements();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Always render bag in background so physics keeps running */}
      <View style={[styles.canvas, activeTab !== 'bag' && styles.hidden]}>
        <PopcornBag kernels={kernels} width={width} height={height} config={DEFAULT_PHYSICS_CONFIG} />
      </View>

      {/* Back button + count badge — inside SafeAreaView so they clear the status bar */}
      <SafeAreaView style={styles.backButtonContainer} edges={['top']}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>✕</Text>
        </Pressable>
        <PopcornCountBadge count={totalCount} />
      </SafeAreaView>

      {activeTab === 'milestones' && Platform.OS !== 'web' && (
        <SafeAreaView style={styles.milestonesContainer} edges={['bottom']}>
          <MilestonesGrid progress={progress} onPressMilestone={() => {}} />
        </SafeAreaView>
      )}

      {/* Bottom tab toggle — mobile only (overlaps main nav on web) */}
      {Platform.OS !== 'web' && (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  canvas: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0, pointerEvents: 'none' },
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  backButton: {
    marginLeft: 16,
    marginTop: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  milestonesContainer: { flex: 1, marginBottom: 60 },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarInner: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 24, gap: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 20 },
  tabActive: { backgroundColor: 'rgba(245,215,110,0.15)' },
  tabText: { color: '#888', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#F5D76E' },
});
