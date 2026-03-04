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

## Phase 2: App Integration (Complete)

### 2.1 Home Screen TV Sections
**PR:** #156 | **Status:** Complete

- [x] "Trending TV Shows" horizontal scroll section
- [x] "Airing Today" section
- [x] TV show cards navigate to `/tv/{id}`
- [x] Category page support for TV list types (`tv_trending`, `tv_airing_today`, etc.)

### 2.2 Profile / Library TV Collection
**PR:** #157 | **Status:** Complete

- [x] Movies/TV toggle in Settings (default collection view preference)
- [x] TV shows displayed in Collection tab with poster grid
- [x] Tap navigates to `/tv/{id}`
- [x] "Watched" stat count includes both movies and TV shows

### 2.3 Analytics / Stats
**PRs:** #159, #165 | **Status:** Complete

- [x] TV shows watched count
- [x] Episodes watched count
- [x] Total watch time (formatted as hours/minutes)
- [x] TV genre breakdown merged into genre donut
- [x] Two rows of stat cards: Movies/TV Shows/Episodes + Watch Time/First Takes/Avg Rating
- [x] Updated `get_user_stats_summary` RPC and `get-user-stats` edge function

### 2.4 Activity Feed
**PR:** #158 | **Status:** Complete

- [x] TV First Takes display with proper metadata
- [x] Navigate to `/tv/{id}` when tapping a TV First Take
- [x] "TV" badge pill on feed items for TV shows
- [x] Feed service uses `media_type` column

### 2.5 Person Screen TV Credits
**PR:** #160 | **Status:** Complete

- [x] TV credits displayed alongside movie credits
- [x] "Known For" section includes TV work (merged + sorted by popularity)
- [x] TV Shows filmography section with show name, character, episode count
- [x] Navigate to `/tv/{id}` when tapping a TV credit

### 2.6 Lists Support
**PR:** #162 | **Status:** Complete

- [x] TV shows can be added to lists from detail screen
- [x] TV shows displayed in list detail view
- [x] Mixed lists (movies + TV shows)

---

## Phase 3: Polish (Mostly Complete)

### 3.1 "Continue Watching" Section
**PRs:** #163, #164 | **Status:** Complete

- [x] Smart section on home screen showing shows with status = 'watching'
- [x] Shows current progress (season/episode)
- [x] Tap navigates to `/tv/{id}`
- [x] Settings toggle to show/hide Continue Watching section (`show_continue_watching` profile preference)

### 3.2 Episode Notifications
**Status:** Deferred

- [ ] Notify when a tracked show has new episodes airing
- [ ] Requires push notification infrastructure (Expo push notifications, scheduled TMDB air date checks)

### 3.3 TV Show Recommendations
**PR:** #166 | **Status:** Complete

- [x] "You Might Also Like" section on TV show detail screen
- [x] Horizontal scroll of up to 10 recommended shows (poster, name, rating)
- [x] Powered by TMDB `/tv/{id}/recommendations` endpoint
- [x] Tap navigates to recommended show's detail page

---

## Bug Fixes

| PR | Issue | Fix |
|---|---|---|
| #161 | TV First Takes routed to movie detail screen and never loaded | Fixed routing in profile.tsx + passed `mediaType` through `useFirstTakeActions` hook; corrected existing DB records |
| — | Stats page 401 Unauthorized | Redeployed `get-user-stats` with `verify_jwt: false` |

---

## Revision History

| Date | Changes |
|------|---------|
| 2025-02-27 | Initial PRD created. Phase 1 complete (PRs #149-152). |
| 2026-02-28 | Phase 2 complete (PRs #156-160, #162, #165). Phase 3 mostly complete (#163-164, #166). Episode notifications deferred. |
