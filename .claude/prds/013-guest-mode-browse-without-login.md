# PRD: Guest Mode - Browse Without Login

## Overview
Allow users to explore CineTrak without creating an account. Only prompt for authentication when they attempt actions that require it (adding to watchlist, creating reviews, etc.).

## Why This Is Critical

### App Store Rejection
Apple rejected CineTrak on **February 3, 2026** citing:
> **Guideline 5.1.1 - Legal - Privacy - Data Collection and Storage**
> The app requires users to register or log in to access features that are not account based.

This is a **blocker** for App Store approval. We cannot launch until this is resolved.

### Industry Standard
- Letterboxd: Full browsing without login
- IMDb: Full browsing without login
- Rotten Tomatoes: Full browsing without login
- Every successful movie app follows this pattern

---

## User Experience

### New Welcome Flow

```
┌─────────────────────────────────────────────────────────────┐
│  CURRENT FLOW (rejected by Apple)                           │
│                                                             │
│  App Launch → Sign In Screen (forced) → Home                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEW FLOW (Apple compliant)                                 │
│                                                             │
│  App Launch → Welcome Screen                                │
│                    ↓                                        │
│              ┌─────────────┐                                │
│              │  CineTrak   │                                │
│              │    Logo     │                                │
│              │             │                                │
│              │ [Sign In]   │ ← Existing users               │
│              │ [Sign Up]   │ ← New users                    │
│              │             │                                │
│              │ [Browse First] ← NEW: Guest mode             │
│              │  "Explore without an account"                │
│              └─────────────┘                                │
│                    ↓                                        │
│         Guest taps "Browse First"                           │
│                    ↓                                        │
│              Home Screen (full access to browse)            │
│                    ↓                                        │
│         Guest taps "Add to Watchlist"                       │
│                    ↓                                        │
│              Login Prompt Modal                             │
│              "Sign in to save movies to your watchlist"     │
│              [Sign In] [Create Account] [Maybe Later]       │
└─────────────────────────────────────────────────────────────┘
```

### Feature Access Matrix

| Feature | Guest Access | Requires Login |
|---------|--------------|----------------|
| View Home screen / First Takes feed | ✅ | |
| Search for movies | ✅ | |
| View movie details | ✅ | |
| View cast & crew | ✅ | |
| Browse trending/popular | ✅ | |
| View public user profiles | ✅ | |
| View journey cards (public) | ✅ | |
| Add to Watchlist | | ✅ |
| Mark as Watched | | ✅ |
| Create First Take / Review | | ✅ |
| Create / Edit Journeys | | ✅ |
| Like / React to content | | ✅ |
| Scan ticket | | ✅ |
| Edit profile | | ✅ |
| Access Settings (account) | | ✅ |
| Generate AI Art | | ✅ |

---

## Technical Architecture

### Current Auth Flow (Problem)

```typescript
// app/_layout.tsx - useProtectedRoute()
if (!user && !inAuthGroup) {
  // Not authenticated and not on auth screens → go to signin
  performNavigation('/(auth)/signin');  // ← FORCED LOGIN
}
```

This forces ALL unauthenticated users to the sign-in screen immediately.

### New Auth Flow (Solution)

```typescript
// app/_layout.tsx - useProtectedRoute()
if (!user && !inAuthGroup) {
  // Check if user has explicitly chosen to browse as guest
  // OR if they're on a publicly accessible screen
  const publicRoutes = ['(tabs)', 'movie', 'person', 'search', 'category'];
  const isPublicRoute = publicRoutes.some(route => segments[0] === route);
  
  if (!isPublicRoute && !hasChosenGuestMode) {
    // Only redirect to welcome if not on public route and hasn't chosen guest mode
    performNavigation('/(auth)/welcome');
  }
}
```

### New Files to Create

```
app/
├── (auth)/
│   └── welcome.tsx           # NEW: Welcome screen with Browse First option

components/
├── modals/
│   └── LoginPromptModal.tsx  # NEW: Contextual login prompt

lib/
├── guest-context.tsx         # NEW: Guest mode state management

hooks/
├── use-require-auth.ts       # NEW: Hook for gating features
```

### Guest Context

```typescript
// lib/guest-context.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GuestContextType {
  isGuest: boolean;           // True if browsing without account
  hasSeenWelcome: boolean;    // True if user has made a choice
  enterGuestMode: () => void; // User chose "Browse First"
  exitGuestMode: () => void;  // User signed in
}

const GUEST_MODE_KEY = '@cinetrak:guest_mode';

export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);

  useEffect(() => {
    // Load guest mode preference on mount
    AsyncStorage.getItem(GUEST_MODE_KEY).then(value => {
      if (value === 'true') {
        setIsGuest(true);
        setHasSeenWelcome(true);
      } else if (value === 'false') {
        setHasSeenWelcome(true);
      }
    });
  }, []);

  const enterGuestMode = async () => {
    setIsGuest(true);
    setHasSeenWelcome(true);
    await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
  };

  const exitGuestMode = async () => {
    setIsGuest(false);
    await AsyncStorage.setItem(GUEST_MODE_KEY, 'false');
  };

  return (
    <GuestContext.Provider value={{ isGuest, hasSeenWelcome, enterGuestMode, exitGuestMode }}>
      {children}
    </GuestContext.Provider>
  );
}
```

### useRequireAuth Hook

```typescript
// hooks/use-require-auth.ts
import { useState, useCallback } from 'react';
import { useAuth } from './use-auth';

interface RequireAuthOptions {
  message?: string;  // Custom message for the login prompt
  feature?: string;  // Feature name for analytics
}

interface RequireAuthResult {
  requireAuth: (callback: () => void, options?: RequireAuthOptions) => void;
  isLoginPromptVisible: boolean;
  loginPromptMessage: string;
  hideLoginPrompt: () => void;
}

export function useRequireAuth(): RequireAuthResult {
  const { user } = useAuth();
  const [isLoginPromptVisible, setIsLoginPromptVisible] = useState(false);
  const [loginPromptMessage, setLoginPromptMessage] = useState('');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const requireAuth = useCallback((callback: () => void, options?: RequireAuthOptions) => {
    if (user) {
      // User is logged in, execute immediately
      callback();
    } else {
      // User is guest, show login prompt
      setLoginPromptMessage(options?.message || 'Sign in to continue');
      setPendingCallback(() => callback);
      setIsLoginPromptVisible(true);
    }
  }, [user]);

  const hideLoginPrompt = useCallback(() => {
    setIsLoginPromptVisible(false);
    setPendingCallback(null);
  }, []);

  return {
    requireAuth,
    isLoginPromptVisible,
    loginPromptMessage,
    hideLoginPrompt,
  };
}
```

### Usage Pattern in Components

```typescript
// Example: Movie detail screen
function MovieDetailScreen() {
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();
  
  const handleAddToWatchlist = () => {
    requireAuth(
      () => {
        // This only runs if user is logged in
        addToWatchlist(movieId);
      },
      { message: 'Sign in to add movies to your watchlist' }
    );
  };

  const handleCreateFirstTake = () => {
    requireAuth(
      () => {
        openFirstTakeModal();
      },
      { message: 'Sign in to share your First Take' }
    );
  };

  return (
    <>
      {/* ... movie details ... */}
      
      <Button onPress={handleAddToWatchlist}>Add to Watchlist</Button>
      <Button onPress={handleCreateFirstTake}>Write First Take</Button>
      
      <LoginPromptModal
        visible={isLoginPromptVisible}
        message={loginPromptMessage}
        onClose={hideLoginPrompt}
        onSignIn={() => router.push('/(auth)/signin')}
        onSignUp={() => router.push('/(auth)/signup')}
      />
    </>
  );
}
```

### Login Prompt Modal

```typescript
// components/modals/LoginPromptModal.tsx
interface LoginPromptModalProps {
  visible: boolean;
  message: string;
  onClose: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

export function LoginPromptModal({ visible, message, onClose, onSignIn, onSignUp }: LoginPromptModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Join CineTrak</Text>
          <Text style={styles.message}>{message}</Text>
          
          <Button onPress={onSignIn} variant="primary">Sign In</Button>
          <Button onPress={onSignUp} variant="secondary">Create Account</Button>
          <Pressable onPress={onClose}>
            <Text style={styles.dismissText}>Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
```

---

## Implementation Phases

### Phase 1: Core Guest Infrastructure
**Goal:** Allow app access without login

- [ ] Create `lib/guest-context.tsx` with GuestProvider
- [ ] Create `app/(auth)/welcome.tsx` welcome screen
- [ ] Add "Browse First" button to welcome screen
- [ ] Update `app/_layout.tsx` to not force signin for guests
- [ ] Wrap app with GuestProvider
- [ ] Guest can reach Home screen without signing in

**Testing:** Fresh install → tap "Browse First" → see Home screen

### Phase 2: Login Prompt System
**Goal:** Graceful prompts when guests try gated features

- [ ] Create `hooks/use-require-auth.ts`
- [ ] Create `components/modals/LoginPromptModal.tsx`
- [ ] Style modal to match app theme (dark/light)
- [ ] Add haptic feedback on modal open
- [ ] Handle "Maybe Later" dismissal

**Testing:** As guest, tap "Add to Watchlist" → see login prompt

### Phase 3: Gate All Write Features
**Goal:** Protect all features that need authentication

- [ ] Movie detail: Add to Watchlist, Mark Watched, First Take
- [ ] Home screen: Like/react on First Takes
- [ ] Search: Any save/add actions
- [ ] Profile tab: Redirect to login or show "Sign in to see your profile"
- [ ] Scan ticket: Prompt login before scan
- [ ] Journey screens: Prompt login for create/edit
- [ ] Settings: Account settings require login

**Testing:** Systematically test each feature as guest

### Phase 4: Polish & Edge Cases
**Goal:** Smooth experience for all scenarios

- [ ] Handle deep links as guest (e.g., shared movie link)
- [ ] "Sign in" from prompt → return to previous screen after auth
- [ ] Clear guest mode when user signs in
- [ ] Handle guest → sign up → onboarding flow
- [ ] Analytics: Track guest → conversion rate
- [ ] Persist guest preference across app restarts

---

## Screen-by-Screen Changes

### Welcome Screen (NEW)
```
┌────────────────────────────┐
│                            │
│        [CineTrak Logo]     │
│                            │
│   Track your movie journey │
│                            │
│   ┌──────────────────────┐ │
│   │      Sign In         │ │
│   └──────────────────────┘ │
│                            │
│   ┌──────────────────────┐ │
│   │    Create Account    │ │
│   └──────────────────────┘ │
│                            │
│      ─── or ───            │
│                            │
│      Browse First →        │
│   Explore without account  │
│                            │
└────────────────────────────┘
```

### Home Screen (Tabs)
- **Logged in:** No change
- **Guest:** Full access to view First Takes feed, but tapping Like shows login prompt

### Profile Tab
- **Logged in:** No change
- **Guest:** Show "Sign in to see your profile" state with Sign In button

### Movie Detail
- **Logged in:** No change
- **Guest:** Can view all details, but action buttons (Watchlist, Watched, First Take) trigger login prompt

---

## Data Considerations

### First Takes Feed (Home)
Currently fetches all public First Takes — this works for guests too.
No changes needed to the query.

### Profile Data
Profile tab should check `user` before fetching.
Show empty state with login CTA for guests.

### Watchlist/Collection
These queries already filter by `user_id`.
For guests, these screens should show login prompt or be inaccessible.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Guest taps push notification | Open app, show content, prompt login if action needed |
| Guest receives shared movie link | Open movie detail (works), prompt on save |
| Guest force-closes during login prompt | Next launch still in guest mode |
| Guest signs up mid-session | Clear guest mode, run onboarding, then return |
| Guest on Profile tab taps Sign In | Navigate to sign in, return to Profile after |
| Logged-in user signs out | Return to welcome screen (not forced guest mode) |

---

## Success Metrics

### Primary
- **App Store Approval** — This is pass/fail

### Secondary
- Guest → Signup conversion rate
- Time spent browsing before signup
- Features that most trigger login prompts
- Drop-off rate at login prompt

---

## Open Questions

1. Should the Profile tab be completely hidden for guests, or show a "Sign in" state?
   - **Recommendation:** Show "Sign in" state — hiding tabs feels broken

2. Should we track anonymous analytics for guests?
   - **Recommendation:** Yes, with clear privacy notice

3. What happens to guest's browsing history if they sign up?
   - **Recommendation:** Nothing persists — clean start on signup

4. Should "Browse First" be more prominent than Sign In?
   - **Recommendation:** No — Sign In first, Browse First as secondary option

---

## Files to Modify

### Core Changes
- `app/_layout.tsx` — Update useProtectedRoute logic
- `app/(auth)/signin.tsx` — Add link to welcome or adjust layout
- `app/(auth)/signup.tsx` — Same as above

### New Files
- `app/(auth)/welcome.tsx` — New welcome screen
- `lib/guest-context.tsx` — Guest state management
- `hooks/use-require-auth.ts` — Auth gating hook
- `components/modals/LoginPromptModal.tsx` — Login prompt modal

### Feature Gating (Phase 3)
- `app/(tabs)/index.tsx` — Gate likes on First Takes
- `app/(tabs)/profile.tsx` — Show login state for guests
- `app/movie/[id].tsx` — Gate watchlist/watched/first-take buttons
- `app/journey/[id].tsx` — Gate edit button
- `app/scan/review.tsx` — Gate entire scan flow
- Any other screens with write actions

---

## References

- [Apple Guideline 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)
- [Letterboxd app](https://apps.apple.com/app/letterboxd/id1054271011) — Reference implementation
