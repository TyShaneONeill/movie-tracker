import type { ImportRunPhase } from './import-run-context';

// Pure view/transition logic for the background-import surfaces, extracted so
// the state machine (running → hidden → complete/error, and the screen's
// re-attach behaviour) is unit-testable without rendering.

export type LocalScreenPhase = 'pick' | 'reading' | 'preview' | 'done';
export type ScreenView = 'importing' | 'error' | 'done' | 'pick' | 'reading' | 'preview';

/**
 * The screen's effective render phase. The provider's RUN phase wins over the
 * screen's local phase — that's what makes returning to the screen mid-run show
 * live progress (re-attach) instead of the pick screen, and shows the done
 * screen for an import that finished while the user was away.
 */
export function importScreenView(runPhase: ImportRunPhase, localPhase: LocalScreenPhase): ScreenView {
  if (runPhase === 'running') return 'importing';
  if (runPhase === 'error') return 'error';
  if (runPhase === 'complete') return 'done';
  return localPhase; // idle → whatever the screen was doing (pick/preview/resume-done)
}

export interface PillView {
  visible: boolean;
  label: string;
  running: boolean;
  kind: 'running' | 'complete' | 'error' | 'hidden';
}

/**
 * The global progress pill's state. Visible only when the feature is enabled,
 * an import is active/finished, and the import screen is NOT focused (the screen
 * shows its own full UI). Labels track the run phase.
 */
export function importPillView(args: {
  enabled: boolean;
  phase: ImportRunPhase;
  screenFocused: boolean;
  processed: number;
  total: number;
}): PillView {
  const active = args.enabled && args.phase !== 'idle' && !args.screenFocused;
  if (!active) return { visible: false, label: '', running: false, kind: 'hidden' };
  if (args.phase === 'running') {
    const pct = args.total > 0 ? Math.round((args.processed / args.total) * 100) : 0;
    return {
      visible: true,
      running: true,
      kind: 'running',
      label: args.total > 0 ? `Importing your history… ${pct}%` : 'Importing your history…',
    };
  }
  if (args.phase === 'complete') {
    return { visible: true, running: false, kind: 'complete', label: 'Import complete' };
  }
  return { visible: true, running: false, kind: 'error', label: 'Import needs a look' };
}
