import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { usePopcornPhysics } from '@/hooks/use-popcorn-physics';
import { PopcornKernel } from './PopcornKernel';
import { MilestoneKernel } from './MilestoneKernel';
import type { PopcornKernel as KernelData } from '@/lib/popcorn-service';
import type { PhysicsConfig } from '@/lib/physics-engine';
import { DEFAULT_PHYSICS_CONFIG } from '@/lib/physics-engine';

interface Props {
  kernels: KernelData[];
  width: number;
  height: number;
  config?: PhysicsConfig;
}

export function PopcornBag({ kernels, width, height, config = DEFAULT_PHYSICS_CONFIG }: Props) {
  const bounds = { w: width, h: height };
  const { particles } = usePopcornPhysics(kernels, bounds, config);

  if (Platform.OS === 'web') {
    return (
      <View style={webStyles.container}>
        <Text style={webStyles.emoji}>🍿</Text>
        <Text style={webStyles.text}>Your popcorn bag lives on the app.</Text>
        <Text style={webStyles.sub}>Download PocketStubs on iOS or Android to watch your kernels fall.</Text>
      </View>
    );
  }

  if (width === 0 || height === 0) return null;

  return (
    <Canvas style={{ width, height, position: 'absolute', top: 0, left: 0 }}>
      {kernels.map((kernel, i) =>
        kernel.is_milestone ? (
          <MilestoneKernel key={kernel.id} kernel={kernel} index={i} particles={particles} />
        ) : (
          <PopcornKernel key={kernel.id} kernel={kernel} index={i} particles={particles} />
        )
      )}
    </Canvas>
  );
}

const webStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emoji: { fontSize: 64 },
  text: { fontSize: 20, fontWeight: '600', color: '#F5D76E', textAlign: 'center' },
  sub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});
