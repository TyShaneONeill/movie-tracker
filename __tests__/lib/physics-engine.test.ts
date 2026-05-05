import { stepPhysics, DEFAULT_PHYSICS_CONFIG } from '@/lib/physics-engine';
import type { Particle } from '@/lib/physics-engine';

describe('stepPhysics — air drag', () => {
  it('smaller particles decelerate faster than larger ones with airDrag enabled', () => {
    const small: Particle = {
      x: 100, y: 100, vx: 5, vy: 0, radius: 10,
      frozen: false, frozenFrames: 0, landed: true,
    };
    const large: Particle = {
      x: 200, y: 100, vx: 5, vy: 0, radius: 30,
      frozen: false, frozenFrames: 0, landed: true,
    };
    const particles = [small, large];
    const bounds = { w: 1000, h: 1000 };
    const config = { ...DEFAULT_PHYSICS_CONFIG, gravity: 0, airDrag: 0.5 };

    // No gravity, just drag — over 30 frames
    for (let i = 0; i < 30; i++) {
      stepPhysics(particles, 0, 0, bounds, 1.0, config);
    }

    // Smaller particle should be visibly slower than the larger one
    expect(Math.abs(small.vx)).toBeLessThan(Math.abs(large.vx) * 0.9);
  });

  it('with airDrag = 0, behaves identically to existing damping (regression guard)', () => {
    // Use landed: false and a velocity below MAX_SPEED so the speed clamp
    // does not interfere with the pure-damping calculation.
    const p: Particle = {
      x: 100, y: 100, vx: 2, vy: 0, radius: 18,
      frozen: false, frozenFrames: 0, landed: false,
    };
    const bounds = { w: 1000, h: 1000 };

    // Run with airDrag explicitly 0 — must reproduce the existing DAMPING-only path.
    const config = { ...DEFAULT_PHYSICS_CONFIG, gravity: 0, airDrag: 0 };
    for (let i = 0; i < 30; i++) {
      stepPhysics([p], 0, 0, bounds, 1.0, config);
    }

    // Velocity should match what the engine produces today (existing DAMPING = 0.91^30)
    const expectedVx = 2 * Math.pow(0.91, 30);
    expect(p.vx).toBeCloseTo(expectedVx, 3);
  });

  it('with no config passed, behaves identically to existing damping (call-site regression guard)', () => {
    // Existing call site at hooks/use-popcorn-physics.ts:72 omits config.
    // That path must remain unchanged.
    const p: Particle = {
      x: 100, y: 100, vx: 2, vy: 0, radius: 18,
      frozen: false, frozenFrames: 0, landed: false,
    };
    const bounds = { w: 1000, h: 1000 };

    for (let i = 0; i < 30; i++) {
      stepPhysics([p], 0, 0, bounds, 1.0);
    }

    const expectedVx = 2 * Math.pow(0.91, 30);
    expect(p.vx).toBeCloseTo(expectedVx, 3);
  });
});
