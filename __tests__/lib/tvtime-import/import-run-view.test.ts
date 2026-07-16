import { importScreenView, importPillView } from '@/lib/tvtime-import/import-run-view';

describe('importScreenView (screen re-attach)', () => {
  it('shows the RUNNING import even if the local phase is pre-import (re-attach on return)', () => {
    // A user who tapped Hide during preview and comes back sees live progress,
    // not the pick/preview screen.
    expect(importScreenView('running', 'pick')).toBe('importing');
    expect(importScreenView('running', 'preview')).toBe('importing');
  });

  it('shows the done screen for an import that finished while away', () => {
    expect(importScreenView('complete', 'pick')).toBe('done');
    expect(importScreenView('complete', 'preview')).toBe('done');
  });

  it('surfaces an errored run so the user can retry', () => {
    expect(importScreenView('error', 'preview')).toBe('error');
  });

  it('falls back to the local phase when no run is active (idle)', () => {
    expect(importScreenView('idle', 'pick')).toBe('pick');
    expect(importScreenView('idle', 'reading')).toBe('reading');
    expect(importScreenView('idle', 'preview')).toBe('preview');
    expect(importScreenView('idle', 'done')).toBe('done'); // resume mode
  });
});

describe('importPillView (global pill state machine)', () => {
  const base = { enabled: true, screenFocused: false, processed: 0, total: 0 } as const;

  it('is hidden when the feature is disabled', () => {
    expect(importPillView({ ...base, enabled: false, phase: 'running' }).visible).toBe(false);
  });

  it('is hidden when no import is active (idle)', () => {
    expect(importPillView({ ...base, phase: 'idle' }).visible).toBe(false);
  });

  it('is hidden while the import SCREEN is focused (the screen shows its own UI)', () => {
    expect(importPillView({ ...base, phase: 'running', screenFocused: true }).visible).toBe(false);
  });

  it('shows a running label with percentage when off-screen mid-import', () => {
    const v = importPillView({ ...base, phase: 'running', processed: 9, total: 18 });
    expect(v).toMatchObject({ visible: true, running: true, kind: 'running' });
    expect(v.label).toBe('Importing your history… 50%');
  });

  it('shows a no-percentage running label before totals are known', () => {
    const v = importPillView({ ...base, phase: 'running', processed: 0, total: 0 });
    expect(v.label).toBe('Importing your history…');
  });

  it('flips to complete, then error', () => {
    expect(importPillView({ ...base, phase: 'complete' })).toMatchObject({ visible: true, running: false, kind: 'complete', label: 'Import complete' });
    expect(importPillView({ ...base, phase: 'error' })).toMatchObject({ visible: true, running: false, kind: 'error', label: 'Import needs a look' });
  });
});
