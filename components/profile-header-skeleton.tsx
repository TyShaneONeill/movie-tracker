import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Spacing } from '@/constants/theme';

interface ProfileIdentitySkeletonProps {
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

export function ProfileIdentitySkeleton({ shimmerColor }: ProfileIdentitySkeletonProps) {
  return (
    <View style={styles.container} testID="profile-identity-skeleton">
      <SkeletonPulse style={styles.avatar} shimmerColor={shimmerColor} />
      <SkeletonPulse style={styles.nameLine} shimmerColor={shimmerColor} />
      <SkeletonPulse style={styles.bioLine} shimmerColor={shimmerColor} />
    </View>
  );
}

export function ProfileStatNumberSkeleton({ shimmerColor }: ProfileIdentitySkeletonProps) {
  return <SkeletonPulse style={styles.statNumber} shimmerColor={shimmerColor} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.sm,
  },
  nameLine: {
    height: 20,
    width: 160,
    borderRadius: 4,
    marginBottom: 6,
  },
  bioLine: {
    height: 14,
    width: 200,
    borderRadius: 4,
  },
  statNumber: {
    height: 18,
    width: 32,
    borderRadius: 4,
    marginBottom: 2,
  },
});
