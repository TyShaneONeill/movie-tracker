// TEMPORARY DIAGNOSTIC — DO NOT MERGE TO MAIN.
// Instruments JSON.stringify with a call counter and stack capture so we can
// identify the call site responsible for the Hermes OOM during cold-start
// content deep-link handling (see PR #489 thread, ips reports
// PocketStubs-2026-05-26-194858…195036).
//
// Revert this entire file + the corresponding import in app/_layout.tsx
// once the cold-start crash root cause is identified.

const originalStringify = JSON.stringify;
let stringifyCount = 0;
const LOG_EVERY = 50;

// Replace JSON.stringify globally. Logs a stack snippet every Nth call so we
// can see whether the call rate is exploding and where the calls originate.
// Use console.warn so the message routes through React Native's log pipe and
// shows up in Metro.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(JSON as any).stringify = function patchedStringify(...args: unknown[]): string {
  stringifyCount++;
  if (stringifyCount % LOG_EVERY === 0) {
    const stack = new Error().stack ?? '<no stack>';
    // Trim to the first ~8 frames after the patched-stringify frame so the log
    // stays grep-able. The first relevant call site is usually frame 2 or 3.
    const trimmed = stack
      .split('\n')
      .slice(1, 10)
      .join('\n');
    // eslint-disable-next-line no-console
    console.warn(`[OOM-DIAG] JSON.stringify call #${stringifyCount}\n${trimmed}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return originalStringify.apply(JSON, args as any);
};

// Stage marker — call from key cold-start points so we can correlate the
// stringify call rate with the deep-link lifecycle.
export function mark(stage: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[OOM-DIAG] STAGE=${stage} stringifyCount=${stringifyCount} t=${Date.now()}`);
}

// Expose count for ad-hoc inspection.
export function getStringifyCount(): number {
  return stringifyCount;
}
