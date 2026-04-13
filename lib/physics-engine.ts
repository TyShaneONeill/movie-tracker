export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const DAMPING = 0.88;
const RESTITUTION = 0.25;
const MAX_SPEED = 20;

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
    p.vx += gravityX * dt;
    p.vy += gravityY * dt;

    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > MAX_SPEED) {
      p.vx = (p.vx / speed) * MAX_SPEED;
      p.vy = (p.vy / speed) * MAX_SPEED;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x - p.radius < 0) { p.x = p.radius; p.vx = Math.abs(p.vx) * RESTITUTION; }
    if (p.x + p.radius > bounds.w) { p.x = bounds.w - p.radius; p.vx = -Math.abs(p.vx) * RESTITUTION; }
    if (p.y - p.radius < 0) { p.y = p.radius; p.vy = Math.abs(p.vy) * RESTITUTION; }
    if (p.y + p.radius > bounds.h) { p.y = bounds.h - p.radius; p.vy = -Math.abs(p.vy) * RESTITUTION; }

    p.vx *= DAMPING;
    p.vy *= DAMPING;
  }

  // Soft overlap resolution — position correction only (no velocity bounce)
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (distSq < minDist * minDist && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
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
  }));
}
