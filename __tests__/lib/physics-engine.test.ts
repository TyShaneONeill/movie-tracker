import { stepPhysics, wake, applyImpulse, DEFAULT_PHYSICS_CONFIG } from '@/lib/physics-engine';
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

    // Run with airDrag explicitly 0 and damping pinned to the original module
    // constant — this test guards the original engine's pure-DAMPING path,
    // independent of whatever the current DEFAULT_PHYSICS_CONFIG.damping happens to be.
    const config = { ...DEFAULT_PHYSICS_CONFIG, gravity: 0, airDrag: 0, damping: 0.91 };
    for (let i = 0; i < 30; i++) {
      stepPhysics([p], 0, 0, bounds, 1.0, config);
    }

    // Velocity should match what the engine produces today (original DAMPING = 0.91^30)
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

  it('clamps the size-drag multiplier at 0 when radius < airDrag (no sign flip)', () => {
    const p: Particle = {
      x: 100, y: 100, vx: 2, vy: 0, radius: 0.4,
      frozen: false, frozenFrames: 0, landed: false,
    };
    const config = { ...DEFAULT_PHYSICS_CONFIG, gravity: 0, airDrag: 0.5 };
    stepPhysics([p], 0, 0, { w: 1000, h: 1000 }, 1.0, config);
    // multiplier = max(0, 1 - 0.5/0.4) = max(0, -0.25) = 0 → vx becomes 0
    expect(p.vx).toBe(0);
    expect(Object.is(p.vx, -0)).toBe(false);
  });
});

describe('stepPhysics — kernel friction', () => {
  it('damps tangential velocity on inter-kernel collision', () => {
    // Two particles, side by side, moving in opposite tangential directions.
    // Their normal velocities will resolve via overlap correction; tangential
    // velocities should be damped by kernelFriction.
    const a: Particle = {
      x: 100, y: 100, vx: 0, vy: 5, radius: 10,
      frozen: false, frozenFrames: 0, landed: true,
    };
    const b: Particle = {
      // Slightly overlapping with a; collision normal points right (+x).
      x: 115, y: 100, vx: 0, vy: -5, radius: 10,
      frozen: false, frozenFrames: 0, landed: true,
    };
    const particles = [a, b];
    const bounds = { w: 1000, h: 1000 };
    const config = { ...DEFAULT_PHYSICS_CONFIG, gravity: 0, kernelFriction: 0.5, airDrag: 0 };

    stepPhysics(particles, 0, 0, bounds, 1.0, config);

    // Tangential (vy) should be damped; was 5 / -5
    expect(Math.abs(a.vy)).toBeLessThan(5);
    expect(Math.abs(b.vy)).toBeLessThan(5);
  });

  it('with kernelFriction = 0, tangential velocity matches no-collision baseline (regression guard)', () => {
    // landed:false avoids the post-landing speed clamp so we can isolate the
    // friction code path. Compare two runs:
    //   (1) collision occurs with friction=0 — friction branch must be a no-op
    //   (2) no collision baseline — same particle alone
    // Both must produce identical tangential velocity.
    const config = { ...DEFAULT_PHYSICS_CONFIG, gravity: 0, kernelFriction: 0, airDrag: 0 };

    const aCollide: Particle = {
      x: 100, y: 100, vx: 0, vy: 1, radius: 10,
      frozen: false, frozenFrames: 0, landed: false,
    };
    const bCollide: Particle = {
      x: 115, y: 100, vx: 0, vy: -1, radius: 10,
      frozen: false, frozenFrames: 0, landed: false,
    };
    stepPhysics([aCollide, bCollide], 0, 0, { w: 1000, h: 1000 }, 1.0, config);

    const aAlone: Particle = {
      x: 100, y: 100, vx: 0, vy: 1, radius: 10,
      frozen: false, frozenFrames: 0, landed: false,
    };
    stepPhysics([aAlone], 0, 0, { w: 1000, h: 1000 }, 1.0, config);

    // friction=0 means the friction branch is skipped → vy must equal the
    // baseline (only damping applied, no tangential reduction from collision).
    expect(aCollide.vy).toBeCloseTo(aAlone.vy, 6);
  });
});

describe('wake', () => {
  it('unfreezes all frozen particles and resets frame counters', () => {
    const particles: Particle[] = [
      { x: 0, y: 0, vx: 0, vy: 0, radius: 10, frozen: true,  frozenFrames: 8, landed: true },
      { x: 0, y: 0, vx: 0, vy: 0, radius: 10, frozen: true,  frozenFrames: 12, landed: true },
      { x: 0, y: 0, vx: 0, vy: 0, radius: 10, frozen: false, frozenFrames: 3, landed: false },
    ];
    wake(particles);
    expect(particles[0].frozen).toBe(false);
    expect(particles[0].frozenFrames).toBe(0);
    expect(particles[1].frozen).toBe(false);
    expect(particles[1].frozenFrames).toBe(0);
    expect(particles[2].frozen).toBe(false);
    expect(particles[2].frozenFrames).toBe(0);
  });
});

describe('applyImpulse', () => {
  it('adds velocity opposite of gravity vector and wakes frozen particles', () => {
    const particles: Particle[] = [
      { x: 0, y: 0, vx: 0, vy: 0, radius: 10, frozen: true, frozenFrames: 8, landed: true },
      { x: 0, y: 0, vx: 0, vy: 0, radius: 10, frozen: false, frozenFrames: 0, landed: true },
    ];
    // Gravity is straight down (gx=0, gy=1) → impulse should be straight up (vy negative)
    applyImpulse(particles, 12, 0, 1);
    expect(particles[0].frozen).toBe(false);
    expect(particles[0].vy).toBeCloseTo(-12, 1);
    expect(particles[0].vx).toBeCloseTo(0, 1);
    expect(particles[1].vy).toBeCloseTo(-12, 1);
  });

  it('applies impulse opposite of any gravity direction', () => {
    const p: Particle = { x: 0, y: 0, vx: 0, vy: 0, radius: 10, frozen: false, frozenFrames: 0, landed: true };
    // Gravity to the right (gx=1, gy=0) → impulse should push left
    applyImpulse([p], 10, 1, 0);
    expect(p.vx).toBeCloseTo(-10, 1);
    expect(p.vy).toBeCloseTo(0, 1);
  });

  it('handles zero gravity vector gracefully (no-op)', () => {
    const p: Particle = { x: 0, y: 0, vx: 5, vy: 5, radius: 10, frozen: false, frozenFrames: 0, landed: true };
    applyImpulse([p], 12, 0, 0);
    // No direction to push — velocity unchanged
    expect(p.vx).toBeCloseTo(5);
    expect(p.vy).toBeCloseTo(5);
  });
});
