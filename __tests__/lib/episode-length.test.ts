import { isDoubleLengthEpisode } from '@/lib/episode-length';

const eps = (...runtimes: (number | null | undefined)[]) => runtimes.map((runtime) => ({ runtime }));

describe('isDoubleLengthEpisode', () => {
  it('flags an hour-long premiere in a 22-minute sitcom (The Office S5E1 "Weight Loss")', () => {
    const season = eps(42, 22, 22, 22, 22, 22, 22, 42, 22, 22);
    expect(isDoubleLengthEpisode({ runtime: 42 }, season)).toBe(true);
  });

  it('does not flag a normal-length episode in the same season', () => {
    const season = eps(42, 22, 22, 22, 22, 22, 22, 42, 22, 22);
    expect(isDoubleLengthEpisode({ runtime: 22 }, season)).toBe(false);
  });

  it('is relative to the season: 42 minutes is NOT a double in a drama with a 45-minute norm', () => {
    const season = eps(45, 44, 46, 45, 42, 45);
    expect(isDoubleLengthEpisode({ runtime: 42 }, season)).toBe(false);
  });

  it('flags a supersized drama finale (2× the season norm)', () => {
    const season = eps(60, 58, 61, 60, 59, 120);
    expect(isDoubleLengthEpisode({ runtime: 120 }, season)).toBe(true);
  });

  it('does not flag a modestly long finale (~1.3×) that platforms ship whole', () => {
    const season = eps(60, 58, 61, 60, 59, 78);
    expect(isDoubleLengthEpisode({ runtime: 78 }, season)).toBe(false);
  });

  it('fails closed with fewer than 4 runtime samples', () => {
    expect(isDoubleLengthEpisode({ runtime: 42 }, eps(22, 22, 42))).toBe(false);
  });

  it('fails closed when the episode has no runtime', () => {
    const season = eps(22, 22, 22, 22, 42);
    expect(isDoubleLengthEpisode({ runtime: null }, season)).toBe(false);
    expect(isDoubleLengthEpisode({}, season)).toBe(false);
  });

  it('ignores null/zero runtimes in the season sample', () => {
    const season = eps(22, null, 0, 22, 22, 22, undefined, 42);
    expect(isDoubleLengthEpisode({ runtime: 42 }, season)).toBe(true);
  });

  it('fails closed on degenerate medians (shorts/clips seasons)', () => {
    const season = eps(3, 4, 3, 5, 4, 8);
    expect(isDoubleLengthEpisode({ runtime: 8 }, season)).toBe(false);
  });

  it('even-count seasons use the midpoint median', () => {
    // median of [20, 22, 24, 40] = 23 → 40 >= 36.8 → double
    expect(isDoubleLengthEpisode({ runtime: 40 }, eps(20, 22, 24, 40))).toBe(true);
  });
});
