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
    const builder = mockSelectChain({
      data: { id: 'ft-1', quote_text: 'Worth the wait', user_id: 'author-1' },
      error: null,
    });

    const result = await notificationTargetExists(
      { data: { first_take_id: 'ft-1' } } as any,
      'viewer-1'
    );

    expect(result).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('first_takes');
    expect(builder.eq).toHaveBeenCalledWith('id', 'ft-1');
  });

  // A wordless take renders on no public surface, so a notification pointing at
  // one is unreachable — same neutral toast as a deleted target. 20260731000000
  // stops the trigger writing these; this covers rows already in the table when
  // it lands. The rule is viewer-dependent: see the author cases below.
  it('returns false for a rating-only first take viewed by someone else', async () => {
    mockSelectChain({
      data: { id: 'ft-2', quote_text: '', user_id: 'author-1' },
      error: null,
    });

    const result = await notificationTargetExists(
      { data: { first_take_id: 'ft-2' } } as any,
      'viewer-1'
    );

    expect(result).toBe(false);
  });

  it('returns false for a whitespace-only first take viewed by someone else', async () => {
    mockSelectChain({
      data: { id: 'ft-3', quote_text: '   ', user_id: 'author-1' },
      error: null,
    });

    const result = await notificationTargetExists(
      { data: { first_take_id: 'ft-3' } } as any,
      'viewer-1'
    );

    expect(result).toBe(false);
  });

  // first_take_id also rides on like_first_take / comment_first_take, whose
  // RECIPIENT is the take's author. Historical wordless takes carry likes and
  // comments (they were visible before the wordless rule), so the author must
  // still be able to tap through — the detail screen shows them the full view.
  it('returns true when the AUTHOR taps a notification on their own wordless take', async () => {
    mockSelectChain({
      data: { id: 'ft-4', quote_text: '', user_id: 'author-1' },
      error: null,
    });

    const result = await notificationTargetExists(
      { data: { first_take_id: 'ft-4' } } as any,
      'author-1'
    );

    expect(result).toBe(true);
  });

  it('still returns false for a DELETED take even when the viewer is the author', async () => {
    mockSelectChain({ data: null, error: null });

    const result = await notificationTargetExists(
      { data: { first_take_id: 'gone' } } as any,
      'author-1'
    );

    expect(result).toBe(false);
  });

  it('treats a wordless take as unreachable when there is no signed-in viewer', async () => {
    mockSelectChain({ data: { id: 'ft-5', quote_text: '' }, error: null });

    const result = await notificationTargetExists({
      data: { first_take_id: 'ft-5' },
    } as any);

    expect(result).toBe(false);
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
