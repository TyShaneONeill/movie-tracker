/**
 * Centralized error message mapping for user-friendly auth errors
 */

const AUTH_ERROR_MAP: Record<string, string> = {
  // Sign In
  'Invalid login credentials': 'Incorrect email or password. Please try again.',
  'Email not confirmed': 'Please check your email and confirm your account first.',
  'Too many requests': 'Too many attempts. Please wait a moment and try again.',

  // Sign Up
  'User already registered': 'An account with this email already exists. Try signing in instead.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
  'Unable to validate email address: invalid format': 'Please enter a valid email address.',
  'Signup requires a valid password': 'Please enter a password.',

  // Password Reset
  'User not found': 'No account found with this email address.',
  'New password should be different from the old password':
    'Please choose a different password than your current one.',

  // OAuth
  'Error getting user email from external provider':
    'Could not get your email from the sign-in provider. Please try again.',

  // Network
  'Network error': 'Connection failed. Please check your internet and try again.',
  'Failed to fetch': 'Connection failed. Please check your internet and try again.',
};

/**
 * Transforms raw API/Supabase error messages into user-friendly messages.
 * Falls back to the original message if no mapping exists.
 */
export function getFriendlyErrorMessage(error: string | Error | null): string {
  if (!error) {
    return 'An unexpected error occurred';
  }

  const message = typeof error === 'string' ? error : error.message;

  // Check for exact match first
  if (AUTH_ERROR_MAP[message]) {
    return AUTH_ERROR_MAP[message];
  }

  // Check for partial matches (some errors contain additional context)
  for (const [key, friendlyMessage] of Object.entries(AUTH_ERROR_MAP)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return friendlyMessage;
    }
  }

  // Return original message if no mapping found
  return message;
}
