/**
 * Pure type definitions for the bug-report AI analysis pipeline.
 *
 * Lives outside the Deno-runtime modules (claude-client.ts, etc.) so that
 * Node-side test files importing these types via `bug-report-format.ts`
 * don't transitively pull in `npm:@anthropic-ai/sdk` or `Deno` globals
 * (which fail Node tsc resolution).
 */

export interface BugAnalysis {
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'crash' | 'ui' | 'data' | 'perf' | 'auth' | 'other';
  area: string;
  confidence: number;
  root_cause_hypothesis: string;
  suspected_files: string[];
  reproduction_guess: string;
  recommended_next_step: string;
}
