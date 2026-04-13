import React from 'react';
import { Canvas } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { usePopcornPhysics } from '@/hooks/use-popcorn-physics';
import { PopcornKernel } from './PopcornKernel';
import { MilestoneKernel } from './MilestoneKernel';
import type { PopcornKernel as KernelData } from '@/lib/popcorn-service';

interface Props {
  kernels: KernelData[];
  width: number;
  height: number;
}

export function PopcornBag({ kernels, width, height }: Props) {
  const bounds = { w: width, h: height };
  const { particles } = usePopcornPhysics(kernels, bounds);
  const activeFilter = useSharedValue<string | null>(null);

  if (width === 0 || height === 0) return null;

  return (
    <Canvas style={{ width, height }}>
      {kernels.map((kernel, i) =>
        kernel.is_milestone ? (
          <MilestoneKernel
            key={kernel.id}
            kernel={kernel}
            index={i}
            particles={particles}
            activeFilter={activeFilter}
          />
        ) : (
          <PopcornKernel
            key={kernel.id}
            kernel={kernel}
            index={i}
            particles={particles}
            activeFilter={activeFilter}
          />
        )
      )}
    </Canvas>
  );
}
