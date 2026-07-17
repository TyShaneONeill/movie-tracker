import {
  recomputeEpisodesWatched,
  RECOMPUTE_RPC,
  type RpcFn,
} from '../../../supabase/functions/import-tvtime/recompute';

// Locks the recompute call contract: ONE rpc() per import call (not per show),
// deduped ids, no-op when nothing was touched, and best-effort (a failure is
// logged, never thrown — a stuck counter must not strand the import).

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

  it('swallows an rpc error (best-effort) — logs, never throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const rpc: RpcFn = async () => ({ error: { code: '42501' } });

    await expect(recomputeEpisodesWatched(rpc, ['a'], 'user-1')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recompute failed code=42501'));
    errorSpy.mockRestore();
  });
});
