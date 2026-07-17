// Atomic episodes_watched recompute — shared by the import-tvtime edge fn and
// its Jest boundary test. Self-contained (no Deno/npm imports) so both runtimes
// can load it.
//
// Replaces the old per-show COUNT-then-UPDATE (a non-atomic read-then-write with
// a concurrent-stale-write race, 2 round-trips/show) with ONE set-based RPC call
// per import call. The recompute_episodes_watched RPC does the actual work in a
// single statement; this wrapper enforces the call contract:
//   * exactly ONE rpc() call per import call (deduped ids), never per-show;
//   * a no-op when nothing was touched;
//   * best-effort — a failure is logged, never thrown, because a stuck counter
//     must not strand the whole import (it self-heals on the next re-import,
//     mirroring the poster self-heal).

export const RECOMPUTE_RPC = 'recompute_episodes_watched';

/** Minimal shape of the supabase-js rpc() we depend on. Typed structurally so
 *  this module stays free of the jsr: import and both Deno and Jest can load it. */
export type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ error: { code?: string } | null }>;

/**
 * Recompute episodes_watched for every show touched in this import call, in one
 * atomic RPC. `touchedShowIds` may contain duplicates (a split show's parts) —
 * they are deduped so the array passed to the RPC is unique.
 */
export async function recomputeEpisodesWatched(
  rpc: RpcFn,
  touchedShowIds: Iterable<string>,
  userId: string,
): Promise<void> {
  const ids = [...new Set(touchedShowIds)];
  if (ids.length === 0) return;

  const { error } = await rpc(RECOMPUTE_RPC, {
    p_user_tv_show_ids: ids,
    p_user_id: userId,
  });
  if (error) {
    console.error(
      `[import-tvtime] episodes_watched recompute failed code=${error.code ?? 'unknown'}`,
    );
  }
}
