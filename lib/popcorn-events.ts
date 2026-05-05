/**
 * Typed event payloads emitted by the popcorn physics engine.
 * Consumers (PopcornBag.tsx) subscribe via callback props to react with
 * haptics, sounds (future), or analytics. Pure type definitions — no
 * emitter implementation lives here.
 */

export interface ImpactEvent {
  /** Magnitude of the velocity vector at the moment of collision. */
  velocity: number;
  /** Stable identifier of the kernel that collided (matches PopcornKernel.id). */
  kernelId: string;
}

export interface JumpEvent {
  /** Magnitude of the detected vertical-axis acceleration spike, in g-units. */
  magnitude: number;
}

export interface SettleEvent {
  /** Number of particles that just settled (transitioned from moving to frozen). */
  count: number;
}

export type PopcornEventCallbacks = {
  onImpact?: (event: ImpactEvent) => void;
  onJump?: (event: JumpEvent) => void;
  onSettle?: (event: SettleEvent) => void;
};
