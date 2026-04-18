// Integration test for syncWidgetCache orchestrator.
// Task 3 fills in TMDB-fetch assertions; this scaffold wires mocks + covers signout.

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/widget-bridge', () => ({
  writeWidgetData: jest.fn().mockResolvedValue(undefined),
  writePosterFile: jest.fn().mockResolvedValue(undefined),
  reloadWidgetTimelines: jest.fn().mockResolvedValue(undefined),
}));

import { syncWidgetCache } from '@/lib/widget-cache';
import { supabase } from '@/lib/supabase';
import { writeWidgetData } from '@/lib/widget-bridge';

describe('syncWidgetCache orchestrator (integration)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes empty payload when user is not authed (signout clear)', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null } });
    await syncWidgetCache();
    expect(writeWidgetData).toHaveBeenCalledTimes(1);
    const call = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(call.shows).toEqual([]);
    expect(call.stats).toEqual({ films_watched: 0, shows_watched: 0 });
  });
});
