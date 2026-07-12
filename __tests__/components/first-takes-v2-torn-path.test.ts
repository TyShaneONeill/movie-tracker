import { buildTornStubPath, TORN_TOP_PADDING } from '@/components/first-takes-v2/torn-stub';

// torn-stub pulls in react-native-svg + theme at module load; stub them so the
// pure path builder can be imported and tested without native deps.
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }));
jest.mock('@/lib/theme-context', () => ({ useTheme: () => ({ effectiveTheme: 'dark' }) }));

const W = 300;
const H = 200;

function tearPoints(d: string): [number, number][] {
  return [...d.matchAll(/L (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)]
    .map((m) => [Number(m[1]), Number(m[2])] as [number, number])
    // tear points ride near the top edge; bottom-corner points have large y.
    .filter(([, y]) => y <= 12);
}

describe('buildTornStubPath — organic tear', () => {
  it('is deterministic for a given size (byte-identical across renders)', () => {
    expect(buildTornStubPath(W, H)).toBe(buildTornStubPath(W, H));
  });

  it('is a closed, well-formed path', () => {
    const d = buildTornStubPath(W, H);
    expect(d.startsWith('M 0 ')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(buildTornStubPath(0, 0)).toBe('');
  });

  it('terminates the last tooth exactly at the right edge', () => {
    const tear = tearPoints(buildTornStubPath(W, H));
    expect(tear[tear.length - 1][0]).toBe(W);
  });

  it('varies tooth widths (hand-torn, not uniform triangles)', () => {
    const xs = tearPoints(buildTornStubPath(W, H)).map(([x]) => x);
    const gaps: number[] = [];
    let prev = 0;
    for (const x of xs) {
      gaps.push(Number((x - prev).toFixed(2)));
      prev = x;
    }
    // Drop the final clamped (partial) tooth; the interior gaps must not be uniform.
    const interior = gaps.slice(0, -1);
    expect(new Set(interior).size).toBeGreaterThan(3);
  });

  it('reserves content clearance below the deepest notch', () => {
    expect(TORN_TOP_PADDING).toBeGreaterThanOrEqual(10);
  });
});
