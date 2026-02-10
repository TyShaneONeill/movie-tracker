import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Spacing } from '@/constants/theme';

interface SearchSkeletonProps {
  cardColor: string;
  shimmerColor: string;
}

function SkeletonPulse({ style, shimmerColor }: { style: any; shimmerColor: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={[style, { backgroundColor: shimmerColor, opacity }]} />;
}

function SearchSkeletonCard({ cardColor, shimmerColor }: SearchSkeletonProps) {
  return (
    <View style={[styles.card, { backgroundColor: cardColor }]}>
      <SkeletonPulse style={styles.poster} shimmerColor={shimmerColor} />
      <View style={styles.info}>
        <SkeletonPulse style={styles.titleLine} shimmerColor={shimmerColor} />
        <SkeletonPulse style={styles.metaLine} shimmerColor={shimmerColor} />
        <SkeletonPulse style={styles.overviewLine1} shimmerColor={shimmerColor} />
        <SkeletonPulse style={styles.overviewLine2} shimmerColor={shimmerColor} />
        <SkeletonPulse style={styles.overviewLine3} shimmerColor={shimmerColor} />
      </View>
    </View>
  );
}

export function SearchSkeletonList({ cardColor, shimmerColor }: SearchSkeletonProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SearchSkeletonCard key={i} cardColor={cardColor} shimmerColor={shimmerColor} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
    gap: 8,
  },
  titleLine: {
    height: 16,
    width: '75%',
    borderRadius: 4,
  },
  metaLine: {
    height: 14,
    width: '40%',
    borderRadius: 4,
  },
  overviewLine1: {
    height: 12,
    width: '100%',
    borderRadius: 4,
    marginTop: 4,
  },
  overviewLine2: {
    height: 12,
    width: '90%',
    borderRadius: 4,
  },
  overviewLine3: {
    height: 12,
    width: '60%',
    borderRadius: 4,
  },
});
