export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  frozen: boolean;
  frozenFrames: number;
  landed: boolean;
  /** Permanent per-kernel multiplier on gravity response (0.85–1.15).
   *  Derived from kernel seed at creation time. Optional — defaults to 1
   *  for callers (and tests) that don't supply it, preserving original
   *  behavior when absent. */
  personality?: number;
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
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  // Tuned 2026-05-04 after the v2 simplification pass: sensor gravity is
  // applied directly (no blended-anchor formula), so the magnitude here is
  // the *only* knob controlling fall speed. Kept slightly above world-g
  // for a snappier feel in a small on-screen bag.
  gravity: 10.0,
  damping: 0.91,
  restitution: 0.30,
  maxSpeed: 8.0,
  overlapCorrection: 0.50,
  // Quadratic drag coefficient. At speed=8 (maxSpeed), this gives ~38% per-frame
  // reduction; at speed=2 (settle phase), only ~3%. Drag is meaningful only when
  // kernels are flying, near-zero when they're glidng to rest.
  airDrag: 0.10,
  kernelFriction: 0.10,
  jumpImpulse: 28.0,
  jumpThreshold: 1.4,
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
    const personality = p.personality ?? 1;
    const massResponse = (REFERENCE_RADIUS / p.radius) * personality;
    p.vx += gravityX * dt * massResponse;
    p.vy += gravityY * dt * massResponse;

    // Speed clamp scaled per-kernel by radius — heavier kernels can move faster.
    // Without this, every landed kernel hits the same maxSpeed and they all
    // travel at the same velocity during a cascade (looks like a rigid block).
    if (p.landed) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const perMaxSpeed = maxSpeed * (p.radius / REFERENCE_RADIUS);
      if (speed > perMaxSpeed) {
        p.vx = (p.vx / speed) * perMaxSpeed;
        p.vy = (p.vy / speed) * perMaxSpeed;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wall collisions
    if (p.x - p.radius < 0) { p.x = p.radius; p.vx = Math.abs(p.vx) * restitution; }
    if (p.x + p.radius > bounds.w) { p.x = bounds.w - p.radius; p.vx = -Math.abs(p.vx) * restitution; }
    if (p.y - p.radius < 0) { p.y = p.radius; p.vy = Math.abs(p.vy) * restitution; }
    if (p.y + p.radius > bounds.h) { p.y = bounds.h - p.radius; p.vy = -Math.abs(p.vy) * restitution; p.landed = true; }

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

  // Single-pass overlap correction — frozen particles are immovable obstacles.
  // We previously ran a 3-pass PBD solver here to settle deep stacks in one
  // frame, but combined with strong gravity that was the root cause of the
  // "boiling pile" jitter — the multi-pass nudged kernels apart faster than
  // sleep detection could catch them. One pass + damping settles fine on
  // device; deeper stacks just take an extra frame or two to relax.
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
        // tangential is reduced by `friction`. friction=0 skips the branch.
        if (friction > 0) {
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
