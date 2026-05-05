import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSharedValue, useFrameCallback, runOnJS } from 'react-native-reanimated';
import { DeviceMotion } from 'expo-sensors';
import {
  stepPhysics,
  wake,
  applyImpulse,
  DEFAULT_PHYSICS_CONFIG,
} from '@/lib/physics-engine';
import type { Particle, PhysicsConfig } from '@/lib/physics-engine';
import type { PopcornKernel } from '@/lib/popcorn-service';
import type {
  ImpactEvent,
  JumpEvent,
  PopcornEventCallbacks,
} from '@/lib/popcorn-events';
import { kernelSize } from '@/lib/kernel-generator';
import { useDeviceTilt } from '@/hooks/use-device-tilt';
import { usePopcornMotionEnabled } from '@/hooks/use-feature-flag';
import { analytics } from '@/lib/analytics';
import { Sentry } from '@/lib/sentry';

interface Bounds {
  w: number;
  h: number;
}

const IMPACT_VELOCITY_THRESHOLD = 1.5;
const IMPACT_THROTTLE_MS = 50;

// Module-level latch — `popcorn:motion_engine_started` is intended as one-shot
// per JS session. The mount useEffect below would otherwise re-fire under
// React StrictMode, fast-refresh, or any caller-driven remount.
let engineStartedTracked = false;

export function usePopcornPhysics(
  kernels: PopcornKernel[],
  bounds: Bounds,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
  callbacks: PopcornEventCallbacks = {},
) {
  const motionEnabled = usePopcornMotionEnabled();
  const tilt = useDeviceTilt({ jumpThreshold: config.jumpThreshold });

  const particles = useSharedValue<Particle[]>([]);
  const boundsRef = useSharedValue(bounds);
  const prevTimestamp = useSharedValue<number>(-1);
  const configRef = useSharedValue(config);
  const motionEnabledRef = useSharedValue(motionEnabled);
  const prevGravityMag = useSharedValue(-1); // sentinel: skip first-frame delta
  const lastImpactTime = useSharedValue(0);

  useEffect(() => {
    configRef.value = config;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.gravity,
    config.damping,
    config.restitution,
    config.maxSpeed,
    config.overlapCorrection,
    config.airDrag,
    config.kernelFriction,
    config.jumpImpulse,
    config.jumpThreshold,
    config.wakeThreshold,
  ]);

  useEffect(() => {
    motionEnabledRef.value = motionEnabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionEnabled]);

  // One-shot telemetry on engine init. Captures sensor + a11y state so we can
  // tell from PostHog dashboards whether the motion path is reachable in the
  // wild. `motionEnabled` is captured as of mount — if a user toggles the
  // feature flag mid-session we won't re-fire (acceptable: this event answers
  // "did motion start" not "is motion currently on").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let sensorAvailable = false;
      let reduceMotion = false;
      try {
        sensorAvailable = await DeviceMotion.isAvailableAsync();
      } catch {
        // Sensor probe failures shouldn't block telemetry; report sensor_available=false.
      }
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        // Same — fall through with reduce_motion_enabled=false.
      }
      if (cancelled) return;
      if (!engineStartedTracked) {
        analytics.track('popcorn:motion_engine_started', {
          enabled: motionEnabled,
          sensor_available: sensorAvailable,
          reduce_motion_enabled: reduceMotion,
        });
        engineStartedTracked = true;
      }
      Sentry.addBreadcrumb({
        category: 'popcorn-motion',
        message: `engine_started enabled=${motionEnabled} sensor=${sensorAvailable} reduceMotion=${reduceMotion}`,
        level: 'info',
      });
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally empty — fire once on mount. `motionEnabled` value at mount
    // is what we want; we don't re-emit on flag flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Wrap callbacks in a ref so the worklet always reaches the latest callback
  // identity. Without this, a PopcornBag re-render with a re-memoized
  // handleImpact / handleJump would never propagate — the worklet's runOnJS
  // closures captured the original `callbacks` object at mount time.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const onImpactJS = (event: ImpactEvent) => {
    callbacksRef.current?.onImpact?.(event);
  };
  const onJumpJS = (event: JumpEvent) => {
    callbacksRef.current?.onJump?.(event);
    // Sample at 1% — jumps fire often enough that full capture would dwarf
    // every other event in the project. 1% is enough to confirm detection
    // isn't pathological without flooding the pipeline.
    if (Math.random() < 0.01) {
      analytics.track('popcorn:motion_jump_detected', { magnitude: event.magnitude });
    }
  };

  useFrameCallback((info) => {
    'worklet';
    if (particles.value.length === 0) return;

    const now = info.timestamp;
    const elapsed = prevTimestamp.value < 0 ? 16.67 : now - prevTimestamp.value;
    prevTimestamp.value = now;
    const dt = Math.min(elapsed / 16.67, 1.0);

    // Resolve gravity vector for this frame.
    const cfg = configRef.value;
    const useMotion = motionEnabledRef.value;
    let gx = 0;
    let gy = cfg.gravity;

    if (useMotion) {
      const g = tilt.gravity.value;
      // NaN guard — sensor data should never be NaN, but applyImpulse and
      // stepPhysics both assume finite inputs. Fall back to constant gravity
      // if anything looks off.
      const finite =
        Number.isFinite(g.gx) && Number.isFinite(g.gy);
      if (finite) {
        const mag = Math.sqrt(g.gx * g.gx + g.gy * g.gy);
        if (mag > 0.01) {
          // Blend sensor gravity with phone-bottom-anchored gravity.
          // tiltInfluence = 0 → bag is anchored, sensor ignored.
          // tiltInfluence = 1 → pure world-gravity (sand-tray feel).
          // Default 0.35 keeps "down = bottom of phone" dominant while
          // still letting tilt nudge the cascade direction.
          const t = cfg.tiltInfluence;
          const sensorGx = g.gx / mag;
          const sensorGy = g.gy / mag;
          gx = sensorGx * t * cfg.gravity;
          gy = ((1 - t) + sensorGy * t) * cfg.gravity;
        }

        // Wake-on-motion: if gravity-vector magnitude changed beyond threshold,
        // unfreeze all so settled kernels react to the new orientation.
        // Sentinel (-1) means first frame after init or sensor recovery — seed
        // the baseline this frame and skip the delta to avoid a spurious wake.
        if (prevGravityMag.value < 0) {
          prevGravityMag.value = mag;
        } else {
          const deltaG =
            Math.abs(mag - prevGravityMag.value) / Math.max(elapsed / 1000, 0.001);
          if (deltaG > cfg.wakeThreshold) {
            wake(particles.value);
          }
          prevGravityMag.value = mag;
        }

        // Drain jump queue → applyImpulse opposite-of-gravity for each event.
        // Snapshot-then-clear so a sensor emit between read and clear isn't
        // silently dropped — it'll be picked up next frame.
        const queue = tilt.jumpQueue.value;
        if (queue.length > 0) {
          tilt.jumpQueue.value = [];
          for (let q = 0; q < queue.length; q++) {
            applyImpulse(particles.value, cfg.jumpImpulse, gx, gy);
            runOnJS(onJumpJS)(queue[q]);
          }
        }
      } else {
        // Sensor data is non-finite — fall through to constant gravity above.
        // Reset baseline so a recovered sensor doesn't compare against stale data.
        prevGravityMag.value = -1;
      }
    }

    // Skip step entirely if everything is settled — saves CPU when bag is at rest
    let allFrozen = true;
    for (let i = 0; i < particles.value.length; i++) {
      if (!particles.value[i].frozen) {
        allFrozen = false;
        break;
      }
    }
    if (allFrozen) return;

    const next = particles.value.slice();
    stepPhysics(next, gx, gy, boundsRef.value, dt, cfg);

    // Throttled impact detection — emit at most once per IMPACT_THROTTLE_MS.
    // Approximate: fires when any kernel is moving fast, not strictly on the
    // collision frame. Sufficient for haptics; precise per-collision events
    // can be added later if sound demands it.
    if (now - lastImpactTime.value > IMPACT_THROTTLE_MS) {
      for (let i = 0; i < next.length; i++) {
        const p = next[i];
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > IMPACT_VELOCITY_THRESHOLD && !p.frozen) {
          runOnJS(onImpactJS)({ velocity: speed, kernelId: String(i) });
          lastImpactTime.value = now;
          break;
        }
      }
    }

    particles.value = next;
  });

  return { particles, motionEnabled };
}
