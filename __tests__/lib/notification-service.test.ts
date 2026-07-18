import { notificationTargetExists } from '@/lib/notification-service';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const fromMock = supabase.from as jest.Mock;

function mockSelectChain(maybeSingleResult: { data: any; error: any }) {
  const builder: any = {};
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
  fromMock.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notificationTargetExists', () => {
  it('returns true when the referenced review still exists', async () => {
    const builder = mockSelectChain({ data: { id: 'review-1' }, error: null });

    const result = await notificationTargetExists({
      data: { review_id: 'review-1' },
    } as any);

    expect(result).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('reviews');
    expect(builder.eq).toHaveBeenCalledWith('id', 'review-1');
  });

  it('returns false for an orphaned notification whose review was deleted (issue #709)', async () => {
    mockSelectChain({ data: null, error: null });

    const result = await notificationTargetExists({
      data: { review_id: 'deleted-review' },
    } as any);

    expect(result).toBe(false);
  });

  it('returns true when the referenced first take still exists', async () => {
    const builder = mockSelectChain({ data: { id: 'ft-1' }, error: null });

    const result = await notificationTargetExists({
      data: { first_take_id: 'ft-1' },
    } as any);

    expect(result).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('first_takes');
    expect(builder.eq).toHaveBeenCalledWith('id', 'ft-1');
  });

  it('returns false when the referenced first take was deleted', async () => {
    mockSelectChain({ data: null, error: null });

    const result = await notificationTargetExists({
      data: { first_take_id: 'deleted-ft' },
    } as any);

    expect(result).toBe(false);
  });

  it('resolves as available for notifications with no content entity to verify (follow, follow_request, etc.)', async () => {
    const result = await notificationTargetExists({ data: {} } as any);

    expect(result).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('resolves as available when data is null', async () => {
    const result = await notificationTargetExists({ data: null } as any);

    expect(result).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
