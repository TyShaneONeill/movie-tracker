import { getFriendlyErrorMessage } from '@/lib/error-messages';

describe('getFriendlyErrorMessage', () => {
  describe('null/undefined input', () => {
    it('returns default message for null', () => {
      expect(getFriendlyErrorMessage(null)).toBe('An unexpected error occurred');
    });
  });

  describe('exact match mapping', () => {
    const exactCases: [string, string][] = [
      ['Invalid login credentials', 'Incorrect email or password. Please try again.'],
      ['Email not confirmed', 'Please check your email and confirm your account first.'],
      ['Too many requests', 'Too many attempts. Please wait a moment and try again.'],
      [
        'User already registered',
        'An account with this email already exists. Try signing in instead.',
      ],
      ['Password should be at least 6 characters', 'Password must be at least 6 characters.'],
      [
        'Unable to validate email address: invalid format',
        'Please enter a valid email address.',
      ],
      ['Signup requires a valid password', 'Please enter a password.'],
      ['User not found', 'No account found with this email address.'],
      [
        'New password should be different from the old password',
        'Please choose a different password than your current one.',
      ],
      [
        'Error getting user email from external provider',
        'Could not get your email from the sign-in provider. Please try again.',
      ],
      ['Network error', 'Connection failed. Please check your internet and try again.'],
      ['Failed to fetch', 'Connection failed. Please check your internet and try again.'],
    ];

    it.each(exactCases)('maps "%s" to friendly message', (input, expected) => {
      expect(getFriendlyErrorMessage(input)).toBe(expected);
    });
  });

  describe('partial match', () => {
    it('matches when the key appears within a longer message', () => {
      expect(getFriendlyErrorMessage('Something: Invalid login credentials happened')).toBe(
        'Incorrect email or password. Please try again.'
      );
    });

    it('is case-insensitive', () => {
      expect(getFriendlyErrorMessage('INVALID LOGIN CREDENTIALS')).toBe(
        'Incorrect email or password. Please try again.'
      );
    });
  });

  describe('Error object input', () => {
    it('extracts message from Error and maps it', () => {
      const err = new Error('Invalid login credentials');
      expect(getFriendlyErrorMessage(err)).toBe(
        'Incorrect email or password. Please try again.'
      );
    });

    it('returns Error.message when no mapping exists', () => {
      const err = new Error('Some unknown error');
      expect(getFriendlyErrorMessage(err)).toBe('Some unknown error');
    });
  });

  describe('unknown error passthrough', () => {
    it('returns the original string when no mapping exists', () => {
      expect(getFriendlyErrorMessage('Something totally unexpected')).toBe(
        'Something totally unexpected'
      );
    });
  });
});
