import { render } from '@testing-library/react-native';
import React from 'react';

// The pill's dependencies are mocked so the test drives the ONE thing that
// matters for the founder's "always peeking" floater: the component must render
// NULL (occupy zero pixels), not merely translate off, whenever there's nothing
// to show — the dominant idle state, and any full-screen flow route.

let mockRun: {
  phase: 'idle' | 'running' | 'complete' | 'error';
  progress: { processed: number; total: number };
  screenFocused: boolean;
  reset: jest.Mock;
} = { phase: 'idle', progress: { processed: 0, total: 0 }, screenFocused: false, reset: jest.fn() };
jest.mock('@/lib/tvtime-import/import-run-context', () => ({ useImportRun: () => mockRun }));

let mockPath = '/';
jest.mock('expo-router', () => ({ usePathname: () => mockPath, router: { push: jest.fn() } }));

jest.mock('@/hooks/use-tvtime-import', () => ({ useTvTimeImportGate: () => ({ enabled: true }) }));
jest.mock('@/lib/theme-context', () => ({ useTheme: () => ({ effectiveTheme: 'dark' }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));

import { ImportProgressPill } from '@/components/tvtime-import/import-progress-pill';

function renderPill() {
  return render(<ImportProgressPill />);
}

beforeEach(() => {
  mockRun = { phase: 'idle', progress: { processed: 0, total: 0 }, screenFocused: false, reset: jest.fn() };
  mockPath = '/';
});

describe('ImportProgressPill', () => {
  it('renders NULL when idle (no active import — the dominant state)', () => {
    mockRun.phase = 'idle';
    const { toJSON } = renderPill();
    expect(toJSON()).toBeNull();
  });

  it('renders the pill during an active import while the user is away from the import screen', () => {
    mockRun.phase = 'running';
    mockRun.screenFocused = false;
    const { toJSON } = renderPill();
    expect(toJSON()).not.toBeNull();
  });

  it('renders NULL on the blank-stubs deck route even with a finished run (route-gated)', () => {
    mockRun.phase = 'complete';
    mockRun.screenFocused = false;
    mockPath = '/tvtime-deck';
    const { toJSON } = renderPill();
    expect(toJSON()).toBeNull();
  });

  it('renders NULL on the import screen route (screen shows its own UI)', () => {
    mockRun.phase = 'running';
    mockRun.screenFocused = false;
    mockPath = '/settings/tvtime-import';
    const { toJSON } = renderPill();
    expect(toJSON()).toBeNull();
  });
});
