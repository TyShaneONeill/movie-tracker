import { useEffect } from 'react';
import { DeviceMotion } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { captureException, Sentry } from '@/lib/sentry';
import type { JumpEvent } from '@/lib/popcorn-events';

export interface DeviceTiltOptions {
  /** Update rate in ms. Default 16 (~60 Hz). */
  updateInterval?: number;
  /** Min vertical accel magnitude (g-units) to register a jump. Default 1.4. */
  jumpThreshold?: number;
}

export interface DeviceTiltResult {
  /** Reanimated SharedValue holding the screen-space gravity unit vector. {gx: 0, gy: 1} = straight down. */
  gravity: SharedValue<{ gx: number; gy: number }>;
  /** Reanimated SharedValue queue of jump events. Worklets drain this each frame. */
  jumpQueue: SharedValue<JumpEvent[]>;
}

const GRAVITY_DOWN_DEFAULT = { gx: 0, gy: 1 };

/** Defensive cap on the jump queue — protects against unbounded growth if a consumer ever fails to drain. Worklets drain at ~60Hz so this should rarely be reached. */
const JUMP_QUEUE_MAX = 16;

/**
 * Subscribes to expo-sensors DeviceMotion. Exposes gravity vector + jump
 * events as SharedValues so worklets can react without re-rendering React.
 *
 * On devices where DeviceMotion is unavailable (web, simulators without
 * sensors), returns identity values (straight-down gravity, empty queue)
 * so the orchestrator can fall through gracefully.
 *
 * Contract: the orchestrator MUST drain `jumpQueue` each frame. The
 * `JUMP_QUEUE_MAX` cap is a defensive backstop, not part of the API
 * contract — relying on it will drop events.
 *
 * Caveat: jump detection compares the per-frame change in
 * `|accelerationIncludingGravity.z|` against `jumpThreshold` in g-units.
 * Fast rotation between orientations (e.g. flipping face-up → portrait)
 * can produce false-positive jumps, so consumers should treat the queue
 * as advisory rather than authoritative.
 */
export function useDeviceTilt(options: DeviceTiltOptions = {}): DeviceTiltResult {
  const updateInterval = options.updateInterval ?? 16;
  const jumpThreshold = options.jumpThreshold ?? 1.4;

  const gravity = useSharedValue(GRAVITY_DOWN_DEFAULT);
  const jumpQueue = useSharedValue<JumpEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let prevZMag = 9.8; // gravity-only baseline

    (async () => {
      try {
        const available = await DeviceMotion.isAvailableAsync();
        if (cancelled || !available) {
          if (!available) {
            Sentry.addBreadcrumb({
              category: 'popcorn-motion',
              message: 'sensor_unavailable',
              level: 'info',
            });
          }
          return;
        }

        DeviceMotion.setUpdateInterval(updateInterval);
        Sentry.addBreadcrumb({
          category: 'popcorn-motion',
          message: `sensor_started intervalMs=${updateInterval} jumpThreshold=${jumpThreshold}`,
          level: 'info',
        });
        subscription = DeviceMotion.addListener((data: { accelerationIncludingGravity?: { x: number; y: number; z: number } }) => {
          const a = data?.accelerationIncludingGravity;
          if (!a) return;

          // Convert from m/s² (where -9.8 in z = at rest face-up) to a
          // unit vector pointing in the screen's "down" direction.
          // Screen +y is "down", so we map device sensor axes accordingly.
          const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
          if (mag > 0.001) {
            // Note: device axes are device-frame; for typical portrait use,
            // a.x is screen-horizontal (right=+) and a.y is screen-vertical (up=+).
            // We invert y because screen +y is downward. z is screen-normal.
            gravity.value = {
              gx: a.x / mag,
              gy: -a.y / mag, // flip so screen-down is positive
            };
          }

          // Jump detection: sudden change in z-magnitude beyond threshold.
          // Threshold is in g-units (1g = 9.8 m/s²).
          const zMag = Math.abs(a.z);
          const deltaG = Math.abs(zMag - prevZMag) / 9.8;
          if (deltaG > jumpThreshold) {
            const next = [...jumpQueue.value, { magnitude: deltaG }];
            jumpQueue.value = next.length > JUMP_QUEUE_MAX ? next.slice(-JUMP_QUEUE_MAX) : next;
          }
          prevZMag = zMag;
        });
      } catch (error) {
        Sentry.addBreadcrumb({
          category: 'popcorn-motion',
          message: `sensor_error ${error instanceof Error ? error.message : String(error)}`,
          level: 'error',
        });
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'use-device-tilt-init',
        });
      }
    })();

    return () => {
      cancelled = true;
      if (subscription) {
        subscription.remove();
        Sentry.addBreadcrumb({
          category: 'popcorn-motion',
          message: 'sensor_stopped',
          level: 'info',
        });
      }
    };
  }, [updateInterval, jumpThreshold, gravity, jumpQueue]);

  return { gravity, jumpQueue };
}
