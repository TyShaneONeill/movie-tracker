# PRD: Onboarding State Migration to Supabase

## Overview
Move the `hasCompletedOnboarding` flag from local AsyncStorage to the Supabase `profiles` table for cross-device persistence.

## Problem Statement
Currently, onboarding completion is stored in AsyncStorage with a key like `cinetrak_onboarding_complete_{userId}`. This causes issues:
- Users see onboarding again after password reset
- Users see onboarding again on new devices
- State can be lost if app data is cleared

## Solution
Store `onboarding_completed` as a boolean column in the `profiles` table.

---

## Implementation

### 1. Database Migration

Run in Supabase SQL Editor:

```sql
-- Add onboarding_completed column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Mark ALL existing users as having completed onboarding
-- (They've been using the app, so they've seen it)
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed IS NULL;

-- Ensure new profiles default to false
ALTER TABLE profiles 
ALTER COLUMN onboarding_completed SET DEFAULT false;
```

### 2. Update database.types.ts

Add to the `profiles` type:

```typescript
profiles: {
  Row: {
    // ... existing fields ...
    onboarding_completed: boolean | null;
  };
  Insert: {
    // ... existing fields ...
    onboarding_completed?: boolean | null;
  };
  Update: {
    // ... existing fields ...
    onboarding_completed?: boolean | null;
  };
};
```

Or regenerate types with: `npx supabase gen types typescript --project-id wliblwulvsrfgqcnbzeh > lib/database.types.ts`

### 3. Update use-onboarding.tsx

```typescript
import { useState, useEffect, useCallback, useContext, createContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

interface OnboardingContextType {
  hasCompletedOnboarding: boolean | null;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch onboarding status from Supabase when user changes
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (authLoading) return;

      if (!user) {
        setHasCompletedOnboarding(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        if (error) {
          // TODO: Sentry error tracking
          setHasCompletedOnboarding(false);
        } else {
          setHasCompletedOnboarding(data?.onboarding_completed ?? false);
        }
      } catch (error) {
        // TODO: Sentry error tracking
        setHasCompletedOnboarding(false);
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    checkOnboardingStatus();
  }, [user?.id, authLoading]);

  const completeOnboarding = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      if (error) {
        // TODO: Sentry error tracking
        return;
      }

      setHasCompletedOnboarding(true);
    } catch (error) {
      // TODO: Sentry error tracking
    }
  }, [user?.id]);

  const resetOnboarding = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: false })
        .eq('id', user.id);

      if (error) {
        // TODO: Sentry error tracking
        return;
      }

      setHasCompletedOnboarding(false);
    } catch (error) {
      // TODO: Sentry error tracking
    }
  }, [user?.id]);

  return (
    <OnboardingContext.Provider value={{ hasCompletedOnboarding, isLoading, completeOnboarding, resetOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
```

### 4. Cleanup (Optional)

Remove AsyncStorage import and related code from the old implementation.

---

## Testing Checklist

- [ ] New user signup → sees onboarding → completes → flag is `true` in Supabase
- [ ] Existing user → should NOT see onboarding (already set to `true`)
- [ ] Password reset → should NOT trigger onboarding again
- [ ] New device login → should NOT trigger onboarding
- [ ] `resetOnboarding()` works (for testing/dev)

---

## Rollback Plan

If issues arise:
1. The AsyncStorage code can be restored
2. The Supabase column doesn't need to be removed (it's additive)

---

## Timeline

- Database migration: 5 minutes
- Code changes: 30 minutes
- Testing: 30 minutes
- **Total: ~1 hour**
