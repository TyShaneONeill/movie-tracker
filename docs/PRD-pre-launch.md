# CineTrak Pre-Launch PRD

## Overview
This document tracks all features, fixes, and refinements needed before launching CineTrak to the app stores.

---

## 1. Authentication & Onboarding

### 1.1 SSO Login Implementation
**Priority:** High
**Status:** Not Started

Currently using email/password authentication. Need to add social sign-in options.

**Requirements:**
- [ ] Google Sign-In (iOS + Android)
- [ ] Apple Sign-In (required for iOS App Store)
- [ ] Update sign-in UI to show SSO buttons
- [ ] Handle account linking (if user signs in with different methods)
- [ ] Test on both platforms

**Technical Notes:**
- Supabase Auth supports OAuth providers
- Apple Sign-In requires Apple Developer account configuration
- Google Sign-In requires Firebase/Google Cloud Console setup

### 1.2 Onboarding Flow
**Priority:** High
**Status:** Not Started

New users need guidance on how to use the app's core features.

**Requirements:**
- [ ] Welcome screen with app value proposition
- [ ] Feature highlights (3-4 screens):
  - Tracking movies (watchlist, watching, watched)
  - First Takes - capture reactions immediately after watching
  - Ticket scanning for theater visits
  - Stats & analytics
- [ ] Optional account setup (profile photo, username)
- [ ] Skip option for returning users
- [ ] Only show on first launch (persist flag in AsyncStorage)

---

## 2. Settings Menu Validation

### 2.1 Audit Current Settings
**Priority:** High
**Status:** Complete (MVP)

Verify all settings screens are functional, not mock UI.

**Settings to Validate:**
- [x] Profile editing (name, username, bio, avatar) - Working
- [x] First Take prompt toggle - Working (persists to Supabase)
- [x] Change Password - Implemented (2025-01-25)
- [x] Sign out - Working
- [ ] Notification preferences - UI only, needs backend (deferred)
- [ ] Theme selection (Light/Dark/System) - UI only, needs implementation
- [x] Privacy settings - Greyed out as "Coming Soon" (requires friends feature)
- [x] Integrations (Letterboxd/Trakt) - Greyed out as "Coming Soon"
- [ ] Data export - Not implemented
- [ ] Delete account - Not implemented

**For each setting:**
1. Verify UI matches design system
2. Confirm data persists to Supabase/local storage
3. Test error states
4. Verify changes reflect immediately in app

---

## 3. Light/Dark Mode

### 3.1 Theme Implementation
**Priority:** Medium
**Status:** Partially Implemented

The app has a color system defined but needs full theme switching support.

**Requirements:**
- [ ] Audit all screens for hardcoded colors
- [ ] Ensure all components use `Colors[colorScheme]`
- [ ] Settings toggle: Light / Dark / System
- [ ] Persist theme preference
- [ ] Test all screens in both modes:
  - [ ] Home
  - [ ] Search
  - [ ] Movie Detail
  - [ ] Scanner
  - [ ] Stats/Analytics
  - [ ] Profile
  - [ ] Settings
  - [ ] Sign In/Sign Up
  - [ ] Modals (First Take, Watchlist, etc.)

**Known Issues:**
- Some components may have hardcoded dark theme colors
- Modal backgrounds may not adapt
- Status bar style needs to match theme

---

## 4. UI Bug Fixes & Refinements

### 4.1 Known UI Issues
**Priority:** Medium
**Status:** Tracking

Track and fix UI bugs discovered during testing.

| Bug | Screen | Priority | Status |
|-----|--------|----------|--------|
| ~~"See All" buttons do nothing~~ | Home | High | **Complete** |
| ~~Search page UI needs refinement~~ | Search | High | **Complete** |
| _Add bugs as discovered_ | | | |

### 4.2 Home Page - Category "See All" Buttons
**Priority:** High
**Status:** Complete

The Home page has movie category sections (Trending, Now Playing, Coming Soon) with "See All" buttons.

**Implemented (2025-01-25):**
- [x] Created `/category/[type].tsx` screen for viewing full category lists
- [x] "See All" navigates to `/category/trending`, `/category/now_playing`, `/category/upcoming`
- [x] Implemented infinite scroll pagination (loads more as you scroll)
- [x] 3-column poster grid with consistent styling
- [x] Back navigation returns to Home

**Categories supported:**
- Trending (trending movies)
- Now Playing (currently in theaters)
- Coming Soon (upcoming releases)

### 4.3 Search Page Refinement
**Priority:** High
**Status:** Complete

The Search page UI has been refined.

**Implemented (2025-01-25):**
- [x] Removed duplicate "search" header (headerShown: false)
- [x] Improved search input with clear button
- [x] Recent searches with AsyncStorage persistence
- [x] Clear all / remove individual recent search working
- [x] Browse by Genre with rotating poster backgrounds (5s interval, no API calls)
- [x] Clicking movie adds to recent searches automatically
- [x] Using expo-image for optimized image loading
- [x] SafeAreaView for proper layout on all devices

### 4.4 Workflow Refinements
**Priority:** Medium
**Status:** Not Started

- [ ] Review all user flows for friction points
- [ ] Ensure loading states are consistent
- [ ] Verify error messages are user-friendly
- [ ] Check empty states for all lists
- [ ] Validate pull-to-refresh where applicable
- [ ] Confirm keyboard dismissal behavior
- [ ] Test deep linking (if applicable)

---

## 5. Future Features (Post-Launch)

These are documented for future reference but NOT blocking launch.

### 5.1 Achievements System
- Unlockable milestones based on watch history
- Visual badges/trophies
- Progress tracking toward next achievement

### 5.2 Analytics Enhancements
- Year selector for filtering stats
- Watch time tracking (requires storing runtime)
- Comparison with friends

### 5.3 Social Features
- Follow friends
- Activity feed from friends
- Share First Takes

### 5.4 Advanced Features
- Movie recommendations
- Watchlist sharing
- Export data to CSV
- Letterboxd import/export

---

## Launch Checklist

Before submitting to app stores:

### App Store Requirements
- [ ] App icons (all sizes)
- [ ] Splash screen
- [ ] Screenshots for App Store listing
- [ ] App description and keywords
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Support email/URL

### Technical
- [ ] Remove all console.log statements
- [ ] Environment variables configured for production
- [ ] Error tracking (Sentry/Bugsnag) configured
- [ ] Analytics configured (if applicable)
- [ ] Test on physical devices (iOS + Android)
- [ ] Test on various screen sizes
- [ ] Performance audit (no jank, fast load times)

### Testing
- [ ] Full regression test of all features
- [ ] Test offline behavior
- [ ] Test with slow network
- [ ] Test sign out / sign in flow
- [ ] Test app kill and resume
- [ ] Test push notifications (if applicable)

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-01-25 | - | Initial PRD created |
| 2025-01-25 | - | Settings audit: Change Password implemented, Privacy/Integrations marked as Coming Soon |
| 2025-01-25 | - | Added Home "See All" buttons and Search page refinement to UI issues |
| 2025-01-25 | - | Implemented "See All" category pages with infinite scroll |
| 2025-01-25 | - | Search page refinement: removed header, recent searches, rotating genre posters |
