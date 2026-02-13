import { handleAuthDeepLink } from '@/lib/deep-link-handler';
import { captureException } from '@/lib/sentry';

// Mock supabase client
const mockExchangeCodeForSession = jest.fn();
const mockSetSession = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockExchangeCodeForSession.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// extractParams is private, so we test it indirectly through handleAuthDeepLink.
// For targeted unit tests of safeDecode / isValidParamValue / extractParams
// we exercise them via the public API.
// ---------------------------------------------------------------------------

describe('handleAuthDeepLink', () => {
  describe('PKCE flow (?code=xxx)', () => {
    it('exchanges code for session and returns path', async () => {
      const url = 'https://example.com/reset-password?code=abc123';

      const result = await handleAuthDeepLink(url);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
      expect(result).toBe('reset-password');
    });

    it('returns path even when exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: new Error('exchange failed'),
      });

      const result = await handleAuthDeepLink(
        'https://example.com/callback?code=bad'
      );

      expect(result).toBe('callback');
      expect(captureException).toHaveBeenCalled();
    });

    it('catches thrown errors from exchangeCodeForSession', async () => {
      mockExchangeCodeForSession.mockRejectedValue(new Error('network'));

      const result = await handleAuthDeepLink(
        'https://example.com/callback?code=bad'
      );

      expect(result).toBe('callback');
      expect(captureException).toHaveBeenCalled();
    });
  });

  describe('implicit flow (#access_token=xxx&refresh_token=xxx)', () => {
    it('sets session and returns path', async () => {
      const url =
        'https://example.com/reset-password#access_token=at123&refresh_token=rt456';

      const result = await handleAuthDeepLink(url);

      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'at123',
        refresh_token: 'rt456',
      });
      expect(result).toBe('reset-password');
    });

    it('returns path even when setSession fails', async () => {
      mockSetSession.mockResolvedValue({ error: new Error('session failed') });

      const url =
        'https://example.com/cb#access_token=at&refresh_token=rt';

      const result = await handleAuthDeepLink(url);

      expect(result).toBe('cb');
      expect(captureException).toHaveBeenCalled();
    });

    it('catches thrown errors from setSession', async () => {
      mockSetSession.mockRejectedValue(new Error('crash'));

      const url =
        'https://example.com/cb#access_token=at&refresh_token=rt';

      const result = await handleAuthDeepLink(url);

      expect(result).toBe('cb');
      expect(captureException).toHaveBeenCalled();
    });
  });

  describe('non-auth URLs', () => {
    it('returns null when no code or tokens are present', async () => {
      const result = await handleAuthDeepLink('https://example.com/movies');

      expect(result).toBeNull();
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('returns null for a URL with only access_token (missing refresh_token)', async () => {
      const result = await handleAuthDeepLink(
        'https://example.com/cb#access_token=at'
      );

      expect(result).toBeNull();
    });
  });

  describe('param extraction / validation (exercised via handleAuthDeepLink)', () => {
    it('filters out disallowed param keys', async () => {
      const url = 'https://example.com/cb?code=good&evil=bad';

      await handleAuthDeepLink(url);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('good');
    });

    it('rejects empty param values', async () => {
      const url = 'https://example.com/cb?code=';

      const result = await handleAuthDeepLink(url);

      // code was empty, so no auth action triggered
      expect(result).toBeNull();
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('rejects param values exceeding MAX_PARAM_LENGTH', async () => {
      const longValue = 'a'.repeat(4097);
      const url = `https://example.com/cb?code=${longValue}`;

      const result = await handleAuthDeepLink(url);

      expect(result).toBeNull();
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('accepts param values at exactly MAX_PARAM_LENGTH', async () => {
      const maxValue = 'a'.repeat(4096);
      const url = `https://example.com/cb?code=${maxValue}`;

      await handleAuthDeepLink(url);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith(maxValue);
    });

    it('handles URI-encoded values via safeDecode', async () => {
      const url = 'https://example.com/cb?code=hello%20world';

      await handleAuthDeepLink(url);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('hello world');
    });

    it('rejects malformed URI-encoded values', async () => {
      const url = 'https://example.com/cb?code=%E0%A4%A';

      const result = await handleAuthDeepLink(url);

      // safeDecode returns null for malformed values, so code is skipped
      expect(result).toBeNull();
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('handles both query and hash params in the same URL', async () => {
      // query code takes priority (PKCE path runs first)
      const url =
        'https://example.com/cb?code=pkce123#access_token=at&refresh_token=rt';

      const result = await handleAuthDeepLink(url);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce123');
      // setSession is NOT called because the code branch returns early
      expect(mockSetSession).not.toHaveBeenCalled();
      expect(result).toBe('cb');
    });
  });

  describe('error handling', () => {
    it('returns null and reports to sentry when Linking.parse throws', async () => {
      const Linking = jest.requireMock('expo-linking');
      Linking.parse.mockImplementationOnce(() => {
        throw new Error('parse failed');
      });

      const result = await handleAuthDeepLink('bad://url');

      expect(result).toBeNull();
      expect(captureException).toHaveBeenCalled();
    });
  });
});
