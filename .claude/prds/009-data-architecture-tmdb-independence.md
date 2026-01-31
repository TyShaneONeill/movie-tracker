# PRD: Data Architecture - TMDB Independence Strategy

## Overview
Design a data architecture that reduces dependency on TMDB while ensuring user collections and lists have reliable, permanent data.

## Current State Analysis

### What We Store (Good ✓)
```
user_movies:
  ✓ tmdb_id
  ✓ title
  ✓ overview
  ✓ poster_path
  ✓ backdrop_path
  ✓ release_date
  ✓ vote_average
  ✓ genre_ids
```

### What We Still Fetch from TMDB (Risk ⚠️)
- Cast & Crew (every movie detail view)
- Genre names (only have IDs)
- Runtime
- Full movie details for search results
- Images (TMDB CDN: image.tmdb.org)
- Streaming providers (JustWatch via TMDB)

### Risks of Current Approach
1. **TMDB rate limits** - 40 requests/10 seconds
2. **TMDB goes down** - Movie details fail to load
3. **TMDB changes data** - Poster URLs, IDs could change
4. **TMDB policy changes** - API access could be restricted
5. **Image CDN dependency** - All images served from TMDB

---

## Proposed Architecture

### Tier 1: Static Reference Data (Immediate)

Store once, rarely changes:

```sql
-- Genres lookup table
CREATE TABLE genres (
  id INT PRIMARY KEY,          -- TMDB genre ID
  name TEXT NOT NULL,
  slug TEXT NOT NULL           -- 'action', 'comedy', etc.
);

-- Seed with TMDB genres (one-time)
INSERT INTO genres (id, name, slug) VALUES
  (28, 'Action', 'action'),
  (12, 'Adventure', 'adventure'),
  (16, 'Animation', 'animation'),
  (35, 'Comedy', 'comedy'),
  (80, 'Crime', 'crime'),
  (99, 'Documentary', 'documentary'),
  (18, 'Drama', 'drama'),
  (10751, 'Family', 'family'),
  (14, 'Fantasy', 'fantasy'),
  (36, 'History', 'history'),
  (27, 'Horror', 'horror'),
  (10402, 'Music', 'music'),
  (9648, 'Mystery', 'mystery'),
  (10749, 'Romance', 'romance'),
  (878, 'Science Fiction', 'science-fiction'),
  (10770, 'TV Movie', 'tv-movie'),
  (53, 'Thriller', 'thriller'),
  (10752, 'War', 'war'),
  (37, 'Western', 'western');
```

### Tier 2: Movie Cache (Progressive)

Global movie table - cache movies as users interact with them:

```sql
CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  tmdb_id INT UNIQUE NOT NULL,
  imdb_id TEXT,                    -- For cross-reference
  
  -- Core Info
  title TEXT NOT NULL,
  original_title TEXT,
  tagline TEXT,
  overview TEXT,
  
  -- Release Info  
  release_date DATE,
  runtime_minutes INT,
  status TEXT,                     -- 'Released', 'Post Production', etc.
  
  -- Ratings
  tmdb_vote_average DECIMAL(3,1),
  tmdb_vote_count INT,
  
  -- Classification
  genre_ids INT[],
  adult BOOLEAN DEFAULT false,
  original_language TEXT,
  
  -- Media (local copies)
  poster_path TEXT,                -- TMDB path for fallback
  poster_local_path TEXT,          -- Supabase Storage path
  backdrop_path TEXT,
  backdrop_local_path TEXT,
  
  -- Metadata
  tmdb_popularity DECIMAL(10,3),
  budget BIGINT,
  revenue BIGINT,
  
  -- Sync tracking
  tmdb_fetched_at TIMESTAMPTZ,     -- When we last pulled from TMDB
  images_cached_at TIMESTAMPTZ,    -- When we copied images locally
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX idx_movies_release_date ON movies(release_date);
```

### Tier 3: People Cache (Cast & Crew)

```sql
CREATE TABLE people (
  id SERIAL PRIMARY KEY,
  tmdb_id INT UNIQUE NOT NULL,
  
  name TEXT NOT NULL,
  biography TEXT,
  birthday DATE,
  deathday DATE,
  place_of_birth TEXT,
  
  profile_path TEXT,               -- TMDB path
  profile_local_path TEXT,         -- Local copy
  
  known_for_department TEXT,       -- 'Acting', 'Directing', etc.
  popularity DECIMAL(10,3),
  
  tmdb_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movie-Person relationships
CREATE TABLE movie_credits (
  id SERIAL PRIMARY KEY,
  movie_id INT REFERENCES movies(id),
  person_id INT REFERENCES people(id),
  
  credit_type TEXT NOT NULL,       -- 'cast' or 'crew'
  
  -- For cast
  character_name TEXT,
  cast_order INT,
  
  -- For crew
  department TEXT,
  job TEXT,
  
  UNIQUE(movie_id, person_id, credit_type, job)
);

CREATE INDEX idx_movie_credits_movie ON movie_credits(movie_id);
CREATE INDEX idx_movie_credits_person ON movie_credits(person_id);
```

### Tier 4: Image Caching Strategy

**Option A: Copy to Supabase Storage**
```typescript
async function cacheMovieImages(movie: Movie) {
  // Download from TMDB
  const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
  const posterBlob = await fetch(posterUrl).then(r => r.blob());
  
  // Upload to Supabase Storage
  const localPath = `posters/${movie.tmdb_id}.jpg`;
  await supabase.storage.from('movie-images').upload(localPath, posterBlob);
  
  // Update movie record
  await supabase.from('movies')
    .update({ poster_local_path: localPath, images_cached_at: new Date() })
    .eq('tmdb_id', movie.tmdb_id);
}
```

**Option B: Use Cloudflare Images (CDN + Transform)**
- Proxy TMDB images through Cloudflare
- Cache indefinitely
- Get resizing/optimization for free

**Option C: Lazy Hybrid (Recommended)**
- Use TMDB CDN by default (fast, free)
- Copy to local storage only for user's library movies
- Background job to cache popular movies

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│    SEARCH     │    │  VIEW MOVIE   │    │ ADD TO LIST   │
│   (Discovery) │    │   (Details)   │    │  (User Data)  │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   TMDB API    │    │ Local Cache   │    │  Supabase     │
│   (Live)      │    │   (First)     │    │  user_movies  │
└───────────────┘    └───────────────┘    └───────────────┘
                              │                     │
                              ▼                     │
                     ┌───────────────┐              │
                     │  TMDB API     │              │
                     │  (Fallback)   │              │
                     └───────────────┘              │
                              │                     │
                              ▼                     ▼
                     ┌─────────────────────────────────┐
                     │        LOCAL CACHE             │
                     │   movies / people / images     │
                     │      (Supabase Tables)         │
                     └─────────────────────────────────┘
```

### Cache-on-Access Pattern

```typescript
async function getMovieDetails(tmdbId: number): Promise<Movie> {
  // 1. Check local cache first
  const { data: cached } = await supabase
    .from('movies')
    .select('*, movie_credits(*, people(*))')
    .eq('tmdb_id', tmdbId)
    .single();
  
  // 2. If cached and fresh (< 30 days), return it
  if (cached && isFresh(cached.tmdb_fetched_at, 30)) {
    return cached;
  }
  
  // 3. Fetch from TMDB
  const tmdbData = await fetchFromTMDB(tmdbId);
  
  // 4. Upsert to local cache (async, don't wait)
  cacheMovieData(tmdbData).catch(console.error);
  
  // 5. Return TMDB data immediately
  return tmdbData;
}
```

---

## Migration Strategy

### Phase 1: Genres Table (Day 1)
- Create genres table
- Seed with TMDB data
- Update UI to use local genres

### Phase 2: Movies Table (Week 1)
- Create movies table
- Add cache-on-access for movie details
- Existing user_movies unchanged

### Phase 3: Link user_movies to movies (Week 2)
- Add `movie_id` FK to `user_movies`
- Backfill existing records
- Update queries to JOIN

### Phase 4: People & Credits (Week 3-4)
- Create people and movie_credits tables
- Cache cast/crew on movie detail view
- Reduces TMDB calls significantly

### Phase 5: Image Caching (Month 2)
- Background job to cache library movie images
- Fallback to TMDB if local not available

---

## Benefits

### User Experience
- Faster movie detail loads (local cache)
- Consistent data (no TMDB changes affecting library)
- Offline capability (future)

### Operational
- Reduced TMDB API calls
- No rate limiting issues at scale
- Data portability

### Business
- Not dependent on single external service
- Can add data TMDB doesn't have
- Potential to support movies not in TMDB

---

## Storage Estimates

| Data | Per Movie | 1K Movies | 100K Movies |
|------|-----------|-----------|-------------|
| Movie record | ~2 KB | 2 MB | 200 MB |
| Poster image | ~50 KB | 50 MB | 5 GB |
| Backdrop image | ~200 KB | 200 MB | 20 GB |
| Credits (avg 20) | ~1 KB | 1 MB | 100 MB |

**Realistic scenario:** 10K movies cached = ~500 MB data + ~2.5 GB images

Supabase Pro: 8 GB storage included. Should be fine for a while.

---

## user_movies Table Update

```sql
-- Add FK to movies table
ALTER TABLE user_movies 
ADD COLUMN movie_id INT REFERENCES movies(id);

-- Index for lookups
CREATE INDEX idx_user_movies_movie_id ON user_movies(movie_id);

-- Keep existing columns as fallback/snapshot
-- Can gradually migrate to using movies table data
```

---

## Open Questions

1. **How stale is acceptable?** 
   - Movie details: 30 days?
   - Cast/crew: 90 days?
   - Images: Forever?

2. **What triggers a refresh?**
   - User requests "refresh" button?
   - Automatic for recently released movies?
   - Never for older movies?

3. **Image strategy:**
   - TMDB CDN only (current, risky)
   - Full local copies (expensive)
   - Hybrid: local for library, TMDB for discovery

4. **What about TV shows?** (Future)
   - Same architecture applies
   - Separate tables or combined?

---

## Timeline

| Phase | Effort | Complexity |
|-------|--------|------------|
| Genres table | 2 hours | Low |
| Movies cache table | 4 hours | Medium |
| Cache-on-access logic | 4 hours | Medium |
| People/credits tables | 4 hours | Medium |
| Link user_movies | 4 hours | Medium |
| Image caching | 8 hours | High |
| **Total** | **~26 hours** | |

---

## Recommendation

**Start with:**
1. Genres table (immediate, 2 hours)
2. Movies cache table (this week)
3. Cache-on-access pattern (this week)

**Defer:**
- Image caching (until storage becomes a concern)
- Full credits caching (until rate limits hit)

This gives you 80% of the benefit with 30% of the effort.
