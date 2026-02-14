import { useState, useEffect, useRef } from 'react';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { supabase } from '@/lib/supabase';

const USERNAME_PATTERN = /^[a-z0-9_]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const DEBOUNCE_DELAY = 400;

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

interface UsernameValidationResult {
  status: UsernameStatus;
  error: string | null;
}

/**
 * Validates username format and checks availability via debounced Supabase query.
 * @param username - The raw username input (should already be lowercased/sanitized)
 * @param currentUserId - The current user's ID to exclude from uniqueness check
 */
export function useUsernameValidation(
  username: string,
  currentUserId: string | undefined
): UsernameValidationResult {
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const debouncedUsername = useDebouncedValue(username, DEBOUNCE_DELAY);
  const abortRef = useRef(false);

  // Format validation (synchronous, no debounce)
  const formatError = getFormatError(username);

  // Availability check (debounced)
  useEffect(() => {
    // Reset if empty or has format errors
    if (!debouncedUsername || getFormatError(debouncedUsername)) {
      setAvailabilityStatus('idle');
      return;
    }

    if (!currentUserId) {
      setAvailabilityStatus('idle');
      return;
    }

    abortRef.current = false;
    setAvailabilityStatus('checking');

    checkAvailability(debouncedUsername, currentUserId).then((available) => {
      if (!abortRef.current) {
        setAvailabilityStatus(available ? 'available' : 'taken');
      }
    });

    return () => {
      abortRef.current = true;
    };
  }, [debouncedUsername, currentUserId]);

  // Derive final status
  if (!username) {
    return { status: 'idle', error: null };
  }

  if (formatError) {
    return { status: 'invalid', error: formatError };
  }

  // Username is valid format but debounce hasn't fired yet
  if (username !== debouncedUsername) {
    return { status: 'checking', error: null };
  }

  if (availabilityStatus === 'taken') {
    return { status: 'taken', error: 'Username is already taken' };
  }

  return { status: availabilityStatus, error: null };
}

function getFormatError(username: string): string | null {
  if (!username) return null;

  if (username.length < USERNAME_MIN_LENGTH) {
    return `Must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Must be at most ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Only lowercase letters, numbers, and underscores';
  }
  return null;
}

async function checkAvailability(username: string, currentUserId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', currentUserId)
    .maybeSingle();

  return data === null;
}

/** Exported for testing */
export { getFormatError, checkAvailability, USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, DEBOUNCE_DELAY };
