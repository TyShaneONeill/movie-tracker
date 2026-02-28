# CineTrak TV Show Support PRD

## Overview
TV show support brings series tracking to CineTrak — search, browse, track episodes, and manage a TV library alongside the existing movie experience.

---

## Phase 1: Foundation (Complete)

### 1.1 Database Schema
**PR:** #149 | **Status:** Complete

Database tables and RLS policies for TV show tracking.

**Tables created:**
- [x] `tv_shows` — Cache table for TMDB metadata (30-day staleness, mirrors `movies` cache)
- [x] `user_tv_shows` — User's TV library with status tracking (watchlist, watching, watched, on_hold, dropped)
- [x] `user_tv_show_likes` — Independent like system (like without adding to library)
- [x] `user_episode_watches` — Per-episode watch tracking with season/episode numbers

**Helper functions:**
- [x] `sync_tv_show_progress()` — RPC that syncs `current_season`, `current_episode`, `episodes_watched` from watched episodes

### 1.2 Edge Functions, Services & Hooks
**PR:** #150 | **Status:** Complete

**Edge functions deployed to Supabase:**
| Function | Purpose |
|----------|---------|
| `search-tv-shows` | Search TMDB for TV shows |
| `get-tv-show-details` | Fetch show with cast, crew, seasons, trailer, providers |
| `discover-tv-shows` | Browse TV shows by genre |
| `get-tv-show-lists` | Trending, airing today, on the air, top rated |
| `get-season-episodes` | Fetch episodes for a specific season |

**Updated edge functions:**
- `get-person-details` — Now includes TV credits via `append_to_response`
- `check-achievements` — Updated with TV show criteria
- `delete-account` — Cleans up TV tables on account deletion

**Services (`lib/tv-show-service.ts`):**
- [x] `searchTvShows()`, `discoverTvShowsByGenre()`, `getTvShowList()`
- [x] `getTvShowDetails()` with cache-first strategy
- [x] `getSeasonEpisodes()`
- [x] Full user library CRUD: `addTvShowToLibrary()`, `updateTvShowStatus()`, `removeTvShowFromLibrary()`
- [x] Like system: `likeTvShow()`, `unlikeTvShow()`, `getTvShowLike()`
- [x] Episode tracking: `markEpisodeWatched()`, `unmarkEpisodeWatched()`, `markSeasonWatched()`, `getWatchedEpisodes()`

**Cache service (`lib/tv-show-cache-service.ts`):**
- [x] 30-day cache staleness threshold
- [x] Stores cast, crew, seasons, trailer as JSONB

**React Query hooks:**
| Hook | Purpose |
|------|---------|
| `useTvShowDetail` | Full show details with cast, crew, trailer, providers, seasons |
| `useUserTvShows` | User's TV library with add/update/remove mutations |
| `useTvShowInLibrary` | Check if show is in user's library |
| `useTvShowActions` | Full CRUD + like/unlike with optimistic updates |
| `useTvShowSearch` | Search with pagination |
| `useDiscoverTvShows` | Genre browsing with infinite scroll |
| `useTvShowList` | Trending/airing/top-rated lists |
| `useEpisodeActions` | Mark/unmark episodes watched per season |
| `useSeasonEpisodes` | Fetch episodes for a season |

### 1.3 TV Show Detail Screen
**PR:** #151 | **Status:** Complete

Full-featured detail screen at `app/tv/[id].tsx`:
- [x] Hero banner with backdrop + gradient overlay
- [x] Play trailer button
- [x] Show metadata: title, year range, seasons/episodes count, rating, genres
- [x] Status badge (Returning Series, Ended, Canceled)
- [x] Network display
- [x] Created by / crew rows
- [x] Status buttons: Watchlist, Watching, Watched, On Hold, Dropped
- [x] Action grid: Like, Lists (Coming Soon), Review (Coming Soon), Share (Coming Soon)
- [x] Seasons & Episodes accordion with per-episode checkbox tracking
- [x] Mark entire season as watched
- [x] Top Cast horizontal scroll
- [x] Where to Watch streaming providers
- [x] First Take modal prompt when marking as Watched

### 1.4 Search Integration
**PR:** #152 | **Status:** Complete

- [x] Movies/TV Shows pill toggle on search screen
- [x] TV show search results with `TvShowSearchCard`
- [x] TV-specific genre browsing (Sci-Fi & Fantasy, Action & Adventure, Animation, Drama, Comedy, Mystery)
- [x] Trending TV shows section
- [x] Recent searches support `'tv'` type with navigation to `/tv/{id}`
- [x] Category chips adapt per media type

---

## Phase 2: App Integration (Not Started)

TV shows work in isolation (search → detail → track) but aren't integrated into the rest of the app.

### 2.1 Home Screen TV Sections
**Priority:** High
**Status:** Not Started

The home screen only shows movie sections. Add TV show sections.

**Requirements:**
- [ ] "Trending TV Shows" horizontal scroll section
- [ ] "Airing Today" or "New Episodes" section
- [ ] Reuse existing `useTvShowList` hook with different list types
- [ ] TV show cards navigate to `/tv/{id}`
- [ ] Consider a media type toggle on home screen, or interleave TV sections with movie sections

**Files:** `app/(tabs)/index.tsx`

### 2.2 Profile / Library TV Collection
**Priority:** High
**Status:** Not Started

The profile screen only shows watched movies. Users need to see their TV library.

**Requirements:**
- [ ] Add TV Shows tab or section to profile collection view
- [ ] Show TV shows grouped by status (Watching, Watchlist, Watched, On Hold, Dropped)
- [ ] Display progress (e.g., "S2 E5 / 8 seasons")
- [ ] Tap navigates to `/tv/{id}`
- [ ] Consider a combined "Library" view with Movies/TV toggle

**Files:** `app/(tabs)/profile.tsx`
**Hooks available:** `useUserTvShows` (already supports status filtering)

### 2.3 Analytics / Stats
**Priority:** Medium
**Status:** Not Started

Analytics screen only tracks movie stats. TV data should be included.

**Requirements:**
- [ ] TV shows watched count
- [ ] Episodes watched count
- [ ] Total TV watch time (requires episode runtimes)
- [ ] TV genre breakdown
- [ ] Combined or tabbed Movies/TV stats view
- [ ] Update `get-user-stats` edge function to query TV tables

**Files:** `app/(tabs)/analytics.tsx`, edge function `get-user-stats`

### 2.4 Activity Feed
**Priority:** Medium
**Status:** Not Started

Feed doesn't distinguish TV First Takes from movie First Takes.

**Requirements:**
- [ ] Display TV First Takes with proper metadata (show name, poster)
- [ ] Navigate to `/tv/{id}` when tapping a TV First Take
- [ ] Show media type indicator (Movie vs TV) on feed items
- [ ] The `first_takes` table already has `media_type` column — feed service needs to use it

**Files:** `lib/feed-service.ts`, feed components

### 2.5 Person Screen TV Credits
**Priority:** Medium
**Status:** Not Started

Person detail screen only shows movie credits. The `get-person-details` edge function already returns TV credits.

**Requirements:**
- [ ] Display TV credits alongside or separate from movie credits
- [ ] Show series name, role, episode count
- [ ] Navigate to `/tv/{id}` when tapping a TV credit
- [ ] "Known For" section should include TV work

**Files:** `app/person/[id].tsx`, `hooks/use-person-detail.ts`

### 2.6 Lists Support
**Priority:** Low
**Status:** Not Started

Users can't add TV shows to lists. This requires new DB tables and UI.

**Requirements:**
- [ ] Create `list_tv_shows` table (or extend `list_movies` to support both)
- [ ] Add TV show to list from detail screen action grid
- [ ] Display TV shows in list detail view
- [ ] Mixed lists (movies + TV shows)

**Files:** List-related screens and services

---

## Phase 3: Polish (Not Started)

### 3.1 "Continue Watching" Section
- [ ] Smart section on home screen showing shows with unwatched episodes
- [ ] Based on `user_tv_shows` with status = 'watching' and incomplete episode tracking
- [ ] Deep link to next unwatched episode's season accordion

### 3.2 Episode Notifications
- [ ] Notify when a tracked show has new episodes airing
- [ ] Requires checking TMDB air dates against user's library

### 3.3 TV Show Recommendations
- [ ] "Because you watched X" recommendations
- [ ] Based on genre overlap and TMDB similar shows API

---

## Implementation Priority

| # | Item | Priority | Effort | Dependencies |
|---|------|----------|--------|--------------|
| 1 | Home screen TV sections | High | Small | None |
| 2 | Profile TV collection | High | Medium | None |
| 3 | Analytics TV stats | Medium | Medium | Edge function update |
| 4 | Activity feed TV support | Medium | Small | None |
| 5 | Person TV credits | Medium | Small | None |
| 6 | Lists TV support | Low | Medium | DB migration |
| 7 | Continue Watching | Low | Medium | Items 1-2 |

Items 1-2 are the highest priority — without them, users have no way to access their TV library outside of search.

---

## Revision History

| Date | Changes |
|------|---------|
| 2025-02-27 | Initial PRD created. Phase 1 complete (PRs #149-152). |
