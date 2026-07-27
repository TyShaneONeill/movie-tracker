import {
  recomputeEpisodesWatched,
  RECOMPUTE_RPC,
  type RpcFn,
} from '../../../supabase/functions/import-tvtime/recompute';

// Locks the recompute call contract: ONE rpc() per import call (not per show),
// deduped ids, no-op when nothing was touched, and best-effort (a failure is
// logged, never thrown — a stuck counter or stale current_* must not strand
// the import).
//
// Since PR-J (2026-07-26) the recompute_episodes_watched RPC ALSO sets
// current_season/current_episode to the show's latest watched episode
// (previously left null on import — see the migration
// 20260726120000_import_sets_current_episode.sql for the reversal). That
// picking logic (ORDER BY season DESC, episode DESC, no watch_number filter —
// matching the organic writer mark_episode_watched exactly) lives in SQL
// inside the RPC body, same as episodes_watched's COUNT — this wrapper has no
// branching of its own to test either way. It was verified directly against
// Postgres in a rolled-back transaction (scattered/out-of-order import,
// organic rewatch row winning as latest, a zero-watch show staying null, and
// an out-of-scope show left untouched) rather than here, because this repo's
// Jest suite has no live-Postgres harness for RPC SQL (recompute's original
// episodes_watched COUNT logic was never Jest-tested for the same reason).
// The tests below already cover the one property that DOES belong at this
// layer: current_* setting piggybacks on the exact same call this file locks,
// so "one rpc call" and "best-effort" apply to it for free.

const ok: RpcFn = async () => ({ error: null });

describe('recomputeEpisodesWatched', () => {
  it('issues exactly one rpc call for every touched show', async () => {
    const rpc = jest.fn(ok);
    await recomputeEpisodesWatched(rpc, ['a', 'b', 'c'], 'user-1');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(RECOMPUTE_RPC, {
      p_user_tv_show_ids: ['a', 'b', 'c'],
      p_user_id: 'user-1',
    });
  });

  it('dedupes repeated ids (a split show seen twice) before the call', async () => {
    const rpc = jest.fn(ok);
    await recomputeEpisodesWatched(rpc, ['a', 'a', 'b', 'a'], 'user-1');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toEqual({
      p_user_tv_show_ids: ['a', 'b'],
      p_user_id: 'user-1',
    });
  });

  it('is a no-op (no rpc call) when nothing was touched', async () => {
    const rpc = jest.fn(ok);
    await recomputeEpisodesWatched(rpc, [], 'user-1');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('swallows an rpc error (best-effort) — logs, never throws; a failed episodes_watched/current_* write cannot strand the import', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const rpc: RpcFn = async () => ({ error: { code: '42501' } });

    await expect(recomputeEpisodesWatched(rpc, ['a'], 'user-1')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recompute failed code=42501'));
    errorSpy.mockRestore();
  });
});
