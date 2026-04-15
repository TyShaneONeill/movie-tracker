import React from 'react';
import { Platform } from 'react-native';
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

  // Skia Canvas requires native CanvasKit (WASM) — not available in web builds
  if (Platform.OS === 'web') return null;
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
