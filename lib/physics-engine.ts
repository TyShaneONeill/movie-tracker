export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  frozen: boolean;
  frozenFrames: number;
  /** Permanent per-kernel multiplier on gravity response (0.85–1.15).
   *  Derived from kernel seed at creation time. Optional — defaults to 1
   *  for callers (and tests) that don't supply it, preserving original
   *  behavior when absent. */
  personality?: number;
  /** Visual rotation in radians. Optional — defaults to 0. */
  rotation?: number;
  /** Angular velocity in radians per frame. Built up by collisions
   *  (kernel-on-kernel and kernel-on-floor); decays each frame via
   *  angular damping. Optional — defaults to 0. */
  angularVelocity?: number;
}

export interface PhysicsConfig {
  gravity: number;
  damping: number;
  restitution: number;
  maxSpeed: number;
  overlapCorrection: number;
  airDrag: number;        // per-kernel-size drag (0 = disabled)
  kernelFriction: number; // tangential damping on collision
  jumpImpulse: number;    // velocity magnitude on jump detection
  jumpThreshold: number;  // minimum vertical accel spike (g-units) to register a jump
  angularDamping: number;     // per-frame angular velocity retention (0.92 = 8% decay/frame)
  angularKickWall: number;    // strength of rotational impulse from wall hits
  angularKickCollision: number; // strength of rotational impulse from inter-kernel collision
  sleepThreshold: number;     // velocity below which kernels count toward freezing (lower = harder to settle)
  framesToFreeze: number;     // consecutive low-velocity frames before freeze (higher = stay alive longer)
  personalityStrength: number; // multiplier on per-kernel personality variation (1 = default, 0 = uniform, 2 = exaggerated)
  massResponseStrength: number; // multiplier on radius-based mass variation (1 = default, 0 = uniform, 2 = exaggerated)
  wallAbsorption: number;      // extra perpendicular-velocity loss on wall hits (0 = no extra loss, 1 = full absorb). Stops bottom-stack bounce jitter without changing restitution feel.
  solverIterations: number;    // overlap-correction passes per frame. 1 = single-pass; 2-3 helps deep stacks (100+ kernels) settle without "freaking out" in corners.
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  // Final tune locked in 2026-05-05 after extensive playground iteration.
  // Energy bleeds via wallAbsorption=1 + heavy damping; no rotation kicks
  // (clean still pile); max solver iterations + ultra-gentle overlap
  // correction settles deep stacks without jitter; max personality +
  // mass response gives every kernel a distinct trajectory under gravity.
  gravity: 7.20,
  damping: 0.50,
  restitution: 0.00,
  maxSpeed: 30.00,
  overlapCorrection: 0.05,
  airDrag: 0.50,
  kernelFriction: 1.00,
  jumpImpulse: 0.00,
  jumpThreshold: 3.00,
  angularDamping: 0.50,
  angularKickWall: 0.00,
  angularKickCollision: 0.00,
  sleepThreshold: 0.01,
  framesToFreeze: 1,
  personalityStrength: 3.00,
  massResponseStrength: 3.00,
  wallAbsorption: 1.00,
  solverIterations: 5,
};

const DAMPING = 0.91;
const RESTITUTION = 0.38;
const MAX_SPEED = 2.2;
const OVERLAP_CORRECTION = 0.50;
const SLEEP_THRESHOLD = 0.08;
const FRAMES_TO_FREEZE = 8;
// Center of the kernelSize() radius range (kernelSize returns 28-42px → radius 14-21px).
// Used to compute per-kernel mass response: lighter kernels (smaller radius) accelerate
// more under gravity, heavier ones less. Without this, every kernel sees the same
// dv/dt and the pile translates as one rigid block — that's the "moves as one unit" bug.
const REFERENCE_RADIUS = 17;

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
  const friction = config?.kernelFriction ?? 0;
  const angularDamping = config?.angularDamping ?? 0.92;
  const angularKickWall = config?.angularKickWall ?? 0.10;
  const angularKickCollision = config?.angularKickCollision ?? 0.20;
  const sleepThreshold = config?.sleepThreshold ?? SLEEP_THRESHOLD;
  const framesToFreeze = config?.framesToFreeze ?? FRAMES_TO_FREEZE;
  const personalityStrength = config?.personalityStrength ?? 1.0;
  const massResponseStrength = config?.massResponseStrength ?? 1.0;
  const wallAbsorption = config?.wallAbsorption ?? 0;
  const wallBounce = restitution * (1 - wallAbsorption);
  const solverIterations = Math.max(1, Math.floor(config?.solverIterations ?? 1));

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Frozen particles are completely skipped — no gravity, no movement
    if (p.frozen) continue;

    // Per-kernel mass response combines two stable, seed-derived properties:
    //   1. Radius — smaller kernels are lighter (accelerate more under gravity).
    //   2. Personality — a permanent ±15% multiplier so two kernels of the
    //      *same* size still behave differently. This gives each kernel a
    //      persistent identity: shake the bag and specific kernels will
    //      reliably end up in different places, every time.
    // Combined effect: ~1.5× spread from radius alone, plus another ±15%
    // from personality, yields kernels that visibly diverge under gravity.
    // Scale per-kernel variation by config multipliers. Strength=0 → uniform
    // (no variation); 1 → default seeded variation; 2 → doubled spread.
    const rawPersonality = p.personality ?? 1;
    const scaledPersonality = 1 + (rawPersonality - 1) * personalityStrength;
    const rawMassResponse = REFERENCE_RADIUS / p.radius;
    const scaledMassResponse = 1 + (rawMassResponse - 1) * massResponseStrength;
    const massResponse = scaledMassResponse * scaledPersonality;
    p.vx += gravityX * dt * massResponse;
    p.vy += gravityY * dt * massResponse;

    // (Speed clamp removed: quadratic airDrag now enforces terminal velocity
    // naturally, so the post-landing clamp was redundant and was actively
    // synchronizing velocities into a rigid block.)

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wall collisions. Floor/wall friction imparts angular impulse — horizontal
    // velocity into the floor partially converts to rolling spin.
    if (p.x - p.radius < 0) {
      p.x = p.radius; p.vx = Math.abs(p.vx) * wallBounce;
      p.angularVelocity = (p.angularVelocity ?? 0) - (p.vy / p.radius) * angularKickWall;
    }
    if (p.x + p.radius > bounds.w) {
      p.x = bounds.w - p.radius; p.vx = -Math.abs(p.vx) * wallBounce;
      p.angularVelocity = (p.angularVelocity ?? 0) + (p.vy / p.radius) * angularKickWall;
    }
    if (p.y - p.radius < 0) {
      p.y = p.radius; p.vy = Math.abs(p.vy) * wallBounce;
      p.angularVelocity = (p.angularVelocity ?? 0) + (p.vx / p.radius) * angularKickWall;
    }
    if (p.y + p.radius > bounds.h) {
      p.y = bounds.h - p.radius; p.vy = -Math.abs(p.vy) * wallBounce;
      p.angularVelocity = (p.angularVelocity ?? 0) + (p.vx / p.radius) * angularKickWall;
    }

    // Drag = linear damping (small constant bleed for eventual rest) + quadratic
    // air drag (proportional to v²). The quadratic term means drag is strong at
    // high speeds (brakes shake/cascade overshoot) but near-zero at low speeds
    // (kernels glide and settle crisply instead of feeling like they're falling
    // through honey). Smaller radii experience more drag per unit speed
    // (higher surface-to-volume ratio). airDrag = 0 disables the quadratic term.
    let speedScale = 1;
    if (dragCoeff > 0) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 0) {
        const dragForce = (dragCoeff / p.radius) * speed * speed;
        const newSpeed = Math.max(0, speed - dragForce * dt);
        speedScale = newSpeed / speed;
      }
    }
    p.vx *= damping * speedScale;
    p.vy *= damping * speedScale;

    // Angular velocity model: rotation accumulates from collision kicks
    // (kernel-on-kernel + wall hits, set above and below) and decays each
    // frame via angular damping. Pure airborne motion no longer drives spin
    // — kernels only rotate when something happens to them.
    const angVel = p.angularVelocity ?? 0;
    p.rotation = (p.rotation ?? 0) + angVel * dt;
    p.angularVelocity = angVel * angularDamping;

    // Sleep detection — must be slow for framesToFreeze consecutive frames
    if (Math.abs(p.vx) < sleepThreshold && Math.abs(p.vy) < sleepThreshold) {
      p.frozenFrames++;
      if (p.frozenFrames >= framesToFreeze) {
        p.vx = 0;
        p.vy = 0;
        p.frozen = true;
      }
    } else {
      p.frozenFrames = 0;
    }
  }

  // Multi-pass overlap correction. solverIterations=1 = single-pass; higher
  // counts propagate corrections through deep stacks in one frame (helps
  // 100+ kernel configurations stop "freaking out" in corners). Friction +
  // angular kicks fire only on the first iteration so they don't compound.
  for (let iter = 0; iter < solverIterations; iter++) {
    const isFirstIter = iter === 0;
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

          // Tangential friction (first iter only — applying it across all
          // iterations would compound and over-damp). Damps the RELATIVE
          // tangential velocity between the colliding pair (Newton's 3rd
          // law: equal and opposite). Coordinated motion is preserved;
          // only kernels SLIDING PAST each other are resisted.
          if (isFirstIter && friction > 0) {
            const tx = -ny, ty = nx;
            const relTangentRaw = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty;
            const relTangent = relTangentRaw * friction * 0.5;
            if (!a.frozen) {
              a.vx -= relTangent * tx;
              a.vy -= relTangent * ty;
            }
            if (!b.frozen) {
              b.vx += relTangent * tx;
              b.vy += relTangent * ty;
            }
            const angularKick = relTangentRaw * friction * angularKickCollision;
            if (!a.frozen) a.angularVelocity = (a.angularVelocity ?? 0) - angularKick / a.radius;
            if (!b.frozen) b.angularVelocity = (b.angularVelocity ?? 0) + angularKick / b.radius;
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
  }));
}

/**
 * Unfreezes every particle and resets its sleep counter. Called by the
 * orchestrator on shake/jump so settled kernels react to the next frame's
 * gravity vector.
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
