export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  frozen: boolean;
  frozenFrames: number;
  landed: boolean;
}

export interface PhysicsConfig {
  gravity: number;
  damping: number;
  restitution: number;
  maxSpeed: number;
  overlapCorrection: number;
  airDrag: number;        // per-kernel-size drag (0 = disabled)
  kernelFriction: number; // tangential damping on collision (applied in Task 3)
  jumpImpulse: number;    // velocity magnitude on jump detection
  jumpThreshold: number;  // minimum vertical accel spike (g-units) to register a jump
  wakeThreshold: number;  // minimum gravity-vector magnitude change per second (g/s) to wake frozen particles
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 9.5,
  damping: 0.91,
  restitution: 0.38,
  maxSpeed: 2.2,
  overlapCorrection: 0.50,
  airDrag: 0.5,
  kernelFriction: 0.15,
  jumpImpulse: 12.0,
  jumpThreshold: 1.4,
  wakeThreshold: 0.3,
};

const DAMPING = 0.91;
const RESTITUTION = 0.38;
const MAX_SPEED = 2.2;
const OVERLAP_CORRECTION = 0.50;
const SLEEP_THRESHOLD = 0.08;
const FRAMES_TO_FREEZE = 8;

export function stepPhysics(
  particles: Particle[],
  gravityX: number,
  gravityY: number,
  bounds: { w: number; h: number },
  dt: number,
  config?: PhysicsConfig
): void {
  'worklet';
  // Read tuning knobs from config with module-constant fallbacks. Callers that
  // don't pass config get exact pre-config behavior (regression guard).
  const damping = config?.damping ?? DAMPING;
  const restitution = config?.restitution ?? RESTITUTION;
  const maxSpeed = config?.maxSpeed ?? MAX_SPEED;
  const overlapCorrection = config?.overlapCorrection ?? OVERLAP_CORRECTION;
  const dragCoeff = config?.airDrag ?? 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Frozen particles are completely skipped — no gravity, no movement
    if (p.frozen) continue;

    p.vx += gravityX * dt;
    p.vy += gravityY * dt;

    // Speed clamp only after first floor contact — allows fast ballistic entry
    if (p.landed) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wall collisions
    if (p.x - p.radius < 0) { p.x = p.radius; p.vx = Math.abs(p.vx) * restitution; }
    if (p.x + p.radius > bounds.w) { p.x = bounds.w - p.radius; p.vx = -Math.abs(p.vx) * restitution; }
    if (p.y - p.radius < 0) { p.y = p.radius; p.vy = Math.abs(p.vy) * restitution; }
    if (p.y + p.radius > bounds.h) { p.y = bounds.h - p.radius; p.vy = -Math.abs(p.vy) * restitution; p.landed = true; }

    // Per-particle damping = configured damping modulated by per-kernel air drag.
    // Smaller radii get a smaller multiplier (more damping), larger radii closer
    // to 1 (less damping). airDrag = 0 disables (regression guard for callers
    // not yet passing config).
    const sizeDragMultiplier = dragCoeff > 0 ? Math.max(0, 1 - dragCoeff / p.radius) : 1;
    p.vx *= damping * sizeDragMultiplier;
    p.vy *= damping * sizeDragMultiplier;

    // Sleep detection — must be slow for FRAMES_TO_FREEZE consecutive frames
    if (Math.abs(p.vx) < SLEEP_THRESHOLD && Math.abs(p.vy) < SLEEP_THRESHOLD) {
      p.frozenFrames++;
      if (p.frozenFrames >= FRAMES_TO_FREEZE) {
        p.vx = 0;
        p.vy = 0;
        p.frozen = true;
      }
    } else {
      p.frozenFrames = 0;
    }
  }

  // Overlap correction — frozen particles are immovable obstacles
  const friction = config?.kernelFriction ?? 0;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      if (a.frozen && b.frozen) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * overlapCorrection;
        const nx = dx / dist, ny = dy / dist;
        if (!a.frozen) { a.x -= nx * overlap; a.y -= ny * overlap; }
        if (!b.frozen) { b.x += nx * overlap; b.y += ny * overlap; }

        // Tangential friction: damp velocity component perpendicular to the
        // collision normal. Normal component is preserved (elastic-ish),
        // tangential is reduced by `friction`.
        if (friction > 0) {
          // Tangent vector is (-ny, nx) — perpendicular to normal.
          const tx = -ny, ty = nx;
          const aTangent = a.vx * tx + a.vy * ty;
          const bTangent = b.vx * tx + b.vy * ty;
          if (!a.frozen) {
            a.vx -= aTangent * tx * friction;
            a.vy -= aTangent * ty * friction;
          }
          if (!b.frozen) {
            b.vx -= bTangent * tx * friction;
            b.vy -= bTangent * ty * friction;
          }
        }
      }
    }
  }
}

export function initParticles(
  count: number,
  bounds: { w: number; h: number },
  radii: number[]
): Particle[] {
  'worklet';
  return Array.from({ length: count }, (_, i) => ({
    x: bounds.w * 0.1 + Math.random() * bounds.w * 0.8,
    y: bounds.h * 0.3 + Math.random() * bounds.h * 0.5,
    vx: (Math.random() - 0.5) * 2,
    vy: Math.random() * 2,
    radius: radii[i] ?? 18,
    frozen: false,
    frozenFrames: 0,
    landed: false,
  }));
}

/**
 * Unfreezes every particle and resets its sleep counter. Called by the
 * orchestrator when motion delta exceeds wakeThreshold so settled kernels
 * react to the next frame's gravity vector.
 */
export function wake(particles: Particle[]): void {
  'worklet';
  for (let i = 0; i < particles.length; i++) {
    particles[i].frozen = false;
    particles[i].frozenFrames = 0;
  }
}

/**
 * Applies a velocity impulse to every particle, in the direction opposite
 * to the supplied gravity vector. Magnitude is in pixels-per-frame units.
 * Wakes frozen particles so they participate in the impulse.
 *
 * If the gravity vector has zero magnitude (no clear "down"), the call is
 * a no-op — there's no meaningful direction to push.
 */
export function applyImpulse(
  particles: Particle[],
  magnitude: number,
  gravityX: number,
  gravityY: number,
): void {
  'worklet';
  const gMag = Math.sqrt(gravityX * gravityX + gravityY * gravityY);
  if (gMag === 0) return;
  // Opposite direction = negate gravity, normalize, multiply by magnitude
  const ix = -(gravityX / gMag) * magnitude;
  const iy = -(gravityY / gMag) * magnitude;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.frozen = false;
    p.frozenFrames = 0;
    p.vx += ix;
    p.vy += iy;
  }
}
