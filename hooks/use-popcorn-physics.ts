import { useEffect } from 'react';
import { useSharedValue, useFrameCallback } from 'react-native-reanimated';
import { stepPhysics } from '@/lib/physics-engine';
import type { Particle } from '@/lib/physics-engine';
import type { PopcornKernel } from '@/lib/popcorn-service';
import { kernelSize } from '@/lib/kernel-generator';

interface Bounds { w: number; h: number }

export function usePopcornPhysics(kernels: PopcornKernel[], bounds: Bounds) {
  const particles = useSharedValue<Particle[]>([]);
  const boundsRef = useSharedValue(bounds);
  const prevTimestamp = useSharedValue<number>(-1);

  // Initialise or add new particles when kernels list grows
  useEffect(() => {
    if (kernels.length === 0) return;
    const current = particles.value;
    const newParticles = kernels.slice(current.length).map((k) => {
      const r = kernelSize(k.seed) / 2;
      return {
        x: bounds.w * 0.3 + Math.random() * bounds.w * 0.4,
        y: -r * 2, // drop in from above
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 2,
        radius: r,
      };
    });
    if (newParticles.length > 0) {
      particles.value = [...current, ...newParticles];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernels.length]);

  useEffect(() => {
    boundsRef.value = bounds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.w, bounds.h]);

  useFrameCallback((info) => {
    'worklet';
    if (particles.value.length === 0) return;
    const prev = prevTimestamp.value;
    const elapsed = prev < 0 ? 16.67 : info.timestamp - prev;
    prevTimestamp.value = info.timestamp;
    const dt = Math.min(elapsed / 16.67, 2);
    const next = particles.value.slice(); // shallow copy to trigger derived value updates
    stepPhysics(next, 0, 9.8, boundsRef.value, dt);
    particles.value = next;
  });

  return { particles };
}
