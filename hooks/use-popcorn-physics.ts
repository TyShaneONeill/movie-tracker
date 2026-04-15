import { useEffect } from 'react';
import { useSharedValue, useFrameCallback } from 'react-native-reanimated';
import { stepPhysics } from '@/lib/physics-engine';
import { DEFAULT_PHYSICS_CONFIG } from '@/lib/physics-engine';
import type { Particle, PhysicsConfig } from '@/lib/physics-engine';
import type { PopcornKernel } from '@/lib/popcorn-service';
import { kernelSize } from '@/lib/kernel-generator';

interface Bounds { w: number; h: number }

export function usePopcornPhysics(
  kernels: PopcornKernel[],
  bounds: Bounds,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG
) {
  const particles = useSharedValue<Particle[]>([]);
  const boundsRef = useSharedValue(bounds);
  const prevTimestamp = useSharedValue<number>(-1);
  const configRef = useSharedValue(config);

  useEffect(() => {
    configRef.value = config;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.gravity, config.damping, config.restitution, config.maxSpeed, config.overlapCorrection]);

  // Initialise or add new particles when kernels list grows
  useEffect(() => {
    if (kernels.length === 0 || bounds.w === 0 || bounds.h === 0) return;
    const current = particles.value;
    const newParticles = kernels.slice(current.length).map((k, localIndex) => {
      const r = kernelSize(k.seed) / 2;
      const globalIndex = current.length + localIndex;
      return {
        x: bounds.w * 0.15 + Math.random() * bounds.w * 0.7,
        y: -r * 2 - globalIndex * 12,
        vx: (Math.random() - 0.5) * 1.0,
        vy: 18 + Math.random() * 8,
        radius: r,
        frozen: false,
        frozenFrames: 0,
        landed: false,
      };
    });
    if (newParticles.length > 0) {
      particles.value = [...current, ...newParticles];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernels.length, bounds.w, bounds.h]);

  useEffect(() => {
    boundsRef.value = bounds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.w, bounds.h]);

  useFrameCallback((info) => {
    'worklet';
    if (particles.value.length === 0) return;

    const now = info.timestamp;
    const elapsed = prevTimestamp.value < 0 ? 16.67 : now - prevTimestamp.value;
    prevTimestamp.value = now;
    const dt = Math.min(elapsed / 16.67, 1.0);

    // Skip entirely if everything is settled — saves CPU when bag is at rest
    let allFrozen = true;
    for (let i = 0; i < particles.value.length; i++) {
      if (!particles.value[i].frozen) { allFrozen = false; break; }
    }
    if (allFrozen) return;

    const next = particles.value.slice();
    stepPhysics(next, 0, configRef.value.gravity, boundsRef.value, dt);
    particles.value = next;
  });

  return { particles };
}
