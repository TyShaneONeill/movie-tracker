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
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 9.5,
  damping: 0.91,
  restitution: 0.38,
  maxSpeed: 2.2,
  overlapCorrection: 0.50,
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
  dt: number
): void {
  'worklet';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Frozen particles are completely skipped — no gravity, no movement
    if (p.frozen) continue;

    p.vx += gravityX * dt;
    p.vy += gravityY * dt;

    // Speed clamp only after first floor contact — allows fast ballistic entry
    if (p.landed) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > MAX_SPEED) {
        p.vx = (p.vx / speed) * MAX_SPEED;
        p.vy = (p.vy / speed) * MAX_SPEED;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wall collisions
    if (p.x - p.radius < 0) { p.x = p.radius; p.vx = Math.abs(p.vx) * RESTITUTION; }
    if (p.x + p.radius > bounds.w) { p.x = bounds.w - p.radius; p.vx = -Math.abs(p.vx) * RESTITUTION; }
    if (p.y - p.radius < 0) { p.y = p.radius; p.vy = Math.abs(p.vy) * RESTITUTION; }
    if (p.y + p.radius > bounds.h) { p.y = bounds.h - p.radius; p.vy = -Math.abs(p.vy) * RESTITUTION; p.landed = true; }

    p.vx *= DAMPING;
    p.vy *= DAMPING;

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
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      if (a.frozen && b.frozen) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * OVERLAP_CORRECTION;
        const nx = dx / dist, ny = dy / dist;
        if (!a.frozen) { a.x -= nx * overlap; a.y -= ny * overlap; }
        if (!b.frozen) { b.x += nx * overlap; b.y += ny * overlap; }
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
