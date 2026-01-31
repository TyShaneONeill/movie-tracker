# PRD: Movie Journey Cards - Personal Movie Experiences

## Overview
Transform the collection from a simple movie list into a gallery of personal movie experiences. Each movie in your collection becomes a "Journey Card" that captures YOUR relationship with that movie — not just the movie itself.

## Vision
> "Every movie you watch is a memory. We help you keep it."

---

## Core Concept

When you tap a movie in your collection, you don't see generic movie details — you see YOUR experience with that movie.

### The Journey Card Contains:

| Field | Description | Source |
|-------|-------------|--------|
| **WHAT** | The movie (poster, title, year) | TMDB / User selection |
| **WHEN** | Date & time watched | Ticket scan / Manual |
| **WHERE** | Location type + details | Ticket scan / Manual |
| **WHO** | Watched with (friends, solo, date) | Manual |
| **HOW** | Platform/format (theater, streaming, etc.) | Ticket scan / Manual |
| **YOUR TAKE** | First Take rating + review | Existing feature |
| **POSTER** | Original or AI-generated artwork | User choice |

### Theater-Specific Fields (from ticket scan):
- Theater name & branch
- Auditorium number
- Seat location
- Ticket price
- Ticket number (for verification/collection)
- Movie age rating

---

## User Flows

### Flow A: Add via Ticket Scan (Rich Path)
```
┌─────────────────────────────────────────────────────────────┐
│  1. SCAN TICKET                                             │
│     Camera captures ticket                                  │
│     ↓                                                       │
│  2. AUTO-PARSE                                              │
│     AI extracts: Movie, Theater, Showtime, Seat, Price     │
│     ↓                                                       │
│  3. CONFIRM & ENHANCE                                       │
│     "Dune: Part Two"                                        │
│     📍 AMC Boston Common - Auditorium 4, Seat J12          │
│     📅 March 15, 2024 at 7:30 PM                           │
│     💵 $18.50                                               │
│                                                             │
│     [Add who you watched with?]  (optional)                │
│     [Add First Take?]  (optional)                          │
│     ↓                                                       │
│  4. JOURNEY CARD CREATED                                    │
│     Added to collection with all details                    │
└─────────────────────────────────────────────────────────────┘
```

### Flow B: Manual Add (Simple Path)
```
┌─────────────────────────────────────────────────────────────┐
│  1. MOVIE DETAIL PAGE                                       │
│     User taps "Add to Collection"                           │
│     ↓                                                       │
│  2. QUICK ADD MODAL                                         │
│     When did you watch it? [Date picker]                    │
│     Where? [Theater / Home / Other]                         │
│     ↓                                                       │
│  3. JOURNEY CARD CREATED                                    │
│     Basic card, can enhance later                           │
└─────────────────────────────────────────────────────────────┘
```

### Flow C: View Journey Card
```
┌─────────────────────────────────────────────────────────────┐
│  Collection Grid                                            │
│  ┌─────┐ ┌─────┐ ┌─────┐                                   │
│  │ 🎬  │ │ 🎬  │ │ 🎬  │  ← Tap a movie                    │
│  └─────┘ └─────┘ └─────┘                                   │
│     ↓                                                       │
│  JOURNEY CARD SCREEN                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Movie Poster - Original or AI Art]                │   │
│  │                                                      │   │
│  │  DUNE: PART TWO                    [Movie Details →]│   │
│  │  ────────────────────────────────────────────────── │   │
│  │                                                      │   │
│  │  📅 March 15, 2024                                  │   │
│  │  📍 AMC Boston Common                               │   │
│  │     Auditorium 4 • Seat J12                         │   │
│  │  👥 With: Mike, Sarah                               │   │
│  │  💵 $18.50                                          │   │
│  │                                                      │   │
│  │  ────────────────────────────────────────────────── │   │
│  │  YOUR FIRST TAKE                                    │   │
│  │  ⭐ 9/10                                            │   │
│  │  "Absolutely incredible sequel..."                  │   │
│  │                                                      │   │
│  │  ────────────────────────────────────────────────── │   │
│  │  [✨ Generate AI Art]  [📝 Edit Details]            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## WHERE Categories & Achievements

### Location Types
| Type | Icon | Examples | Potential Achievements |
|------|------|----------|----------------------|
| Theater | 🎭 | AMC, Regal, Alamo | "Cinema Buff" - 50 theater visits |
| Home | 🏠 | Living room, bedroom | "Homebody" - 100 movies at home |
| Airplane | ✈️ | In-flight entertainment | "Mile High Cinema" - 10 plane movies |
| Train | 🚂 | Amtrak, commuter rail | "Rail Reviewer" - 5 train movies |
| Hotel | 🏨 | Travel viewing | "Road Warrior" - 20 hotel movies |
| Outdoor | 🌙 | Drive-in, outdoor screening | "Under the Stars" - 5 outdoor movies |
| Friend's Place | 🏡 | Movie night at friend's | "Social Butterfly" - 25 at friends |
| Other | 📍 | Unique locations | Special badges for unique spots |

### Achievement Ideas
- "Opening Night" - Watch a movie on release day
- "Marathon Runner" - Watch 3+ movies in one day
- "Early Bird" - Watch a movie before noon
- "Night Owl" - Watch a movie after midnight
- "Loyalty Program" - 10 movies at same theater
- "Globe Trotter" - Watch movies in 5+ different states/countries

---

## Data Model

### Updated user_movies table
```sql
-- Extend existing user_movies or create new journey_cards table
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS (
  -- When
  watched_at TIMESTAMPTZ,
  
  -- Where (location type)
  location_type TEXT, -- 'theater', 'home', 'airplane', 'train', 'hotel', 'outdoor', 'other'
  location_name TEXT, -- "AMC Boston Common" or "Home" or "Delta Flight 123"
  
  -- Theater-specific (from ticket scan)
  theater_chain TEXT,
  theater_branch TEXT,
  auditorium TEXT,
  seat_location TEXT,
  ticket_price DECIMAL(6,2),
  ticket_number TEXT,
  
  -- Social
  watched_with TEXT[], -- Array of names
  
  -- Platform/Format
  watch_platform TEXT, -- 'theatrical', 'netflix', 'amazon', 'disney+', 'hbo', 'physical', etc.
  watch_format TEXT,   -- 'imax', 'dolby', '3d', 'standard', '4k', 'dvd', 'bluray'
  
  -- Display preference
  display_poster TEXT DEFAULT 'original', -- 'original' or 'ai_generated'
  ai_poster_url TEXT,
  ai_poster_rarity TEXT, -- 'common', 'uncommon', 'rare', 'holographic'
  
  -- Metadata
  journey_created_at TIMESTAMPTZ DEFAULT NOW(),
  journey_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for stats queries
CREATE INDEX idx_user_movies_location_type ON user_movies(user_id, location_type);
CREATE INDEX idx_user_movies_watched_at ON user_movies(user_id, watched_at);
CREATE INDEX idx_user_movies_theater_chain ON user_movies(user_id, theater_chain);
```

---

## AI Art Integration (Future - PRD 008)

The Journey Card is where AI-generated artwork lives:

### Poster Selection
```
┌─────────────────────────────────────────────────────────┐
│  Choose Your Poster                                     │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐                    │
│  │             │    │   ✨ AI     │                    │
│  │  Original   │    │  Generated  │                    │
│  │   Poster    │    │    Art      │                    │
│  │             │    │             │                    │
│  └─────────────┘    └─────────────┘                    │
│     [Select]           [Select]                        │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Don't have AI art yet?                                │
│  [✨ Generate Now - Premium]                           │
└─────────────────────────────────────────────────────────┘
```

### Rarity System (Gacha Mechanics)
| Rarity | Chance | Visual Effect |
|--------|--------|---------------|
| Common | 60% | Standard AI art |
| Uncommon | 25% | Subtle shimmer effect |
| Rare | 12% | Animated sparkle border |
| Holographic | 3% | Full holographic animation |

**Business Model:**
- Free users: Can view AI art others share, cannot generate
- Premium: X generations per month
- Pay-per-generate: One-time purchase for single generation
- Re-roll: Pay to try for higher rarity

---

## Integration Points

### Ticket Scanning (PRD 005)
- Ticket scan auto-populates journey card fields
- Parser extracts: movie, theater, showtime, seat, price, auditorium

### First Takes
- Rating and review displayed on journey card
- One-tap to add First Take from journey card

### Stats & Analytics (Future)
- "You watched 47 movies this year"
- "Your top theater: AMC Boston (12 visits)"
- "Most watched genre: Sci-Fi"
- "You've spent $342 on movie tickets"
- "Favorite movie buddy: Mike (8 movies together)"

### Social Features (Future)
- Share journey card as image
- Compare collections with friends
- "Mike also watched this at AMC Boston"

---

## Implementation Phases

### Phase 1: Foundation (This PR)
- [ ] Add new fields to user_movies table
- [ ] Create Journey Card detail screen
- [ ] Basic UI showing existing data (movie, date, rating)
- [ ] Link from collection grid to journey card
- [ ] "Movie Details" link from journey card

### Phase 2: Location Tracking
- [ ] Location type selector on add flow
- [ ] WHERE section on journey card
- [ ] Basic location stats

### Phase 3: Theater Integration
- [ ] Connect ticket scanning to journey cards
- [ ] Display ticket details (seat, price, auditorium)
- [ ] Theater chain tracking

### Phase 4: Social & Who
- [ ] "Watched with" field
- [ ] Add friends/names
- [ ] Social stats

### Phase 5: AI Art (PRD 008)
- [ ] Generate AI art button
- [ ] Rarity system
- [ ] Poster selection
- [ ] Premium gating

### Phase 6: Achievements
- [ ] Achievement definitions
- [ ] Progress tracking
- [ ] Badge display on profile

---

## Success Metrics

- **Engagement:** Time spent on journey cards vs old detail view
- **Completion:** % of movies with location data filled in
- **Ticket scans:** Increase in ticket scanning usage
- **Retention:** Users with 10+ journey cards retention rate
- **Revenue:** AI art generation conversion rate

---

## Multiple Journeys UX

Users can watch the same movie multiple times — each viewing is a separate journey.

### Journey Carousel
```
┌─────────────────────────────────────────────────────────┐
│  DUNE: PART TWO                      [Movie Details →] │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Journey 1 of 3                    ← ● ○ ○ →           │
│                                    (swipe or tap)       │
│  ┌─────────────────────────────────────────────────┐   │
│  │  [Poster]                                        │   │
│  │                                                  │   │
│  │  📅 March 15, 2024                              │   │
│  │  📍 AMC Boston • IMAX                           │   │
│  │  👥 With: Mike, Sarah                           │   │
│  │  ⭐ 9/10 - "Incredible first viewing"           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [+ Add New Journey]                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Swipe to Second Journey
```
┌─────────────────────────────────────────────────────────┐
│  DUNE: PART TWO                      [Movie Details →] │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Journey 2 of 3                    ○ ● ○               │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  [AI Art Poster - Holographic ✨]                │   │
│  │                                                  │   │
│  │  📅 April 2, 2024                               │   │
│  │  📍 Home • 4K Blu-ray                           │   │
│  │  👥 Solo rewatch                                │   │
│  │  ⭐ 10/10 - "Even better the second time"       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [+ Add New Journey]                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Data Model
- Each journey is a separate row in `user_movies`
- Same `tmdb_id`, same `user_id`, different `journey_created_at`
- `journey_number` field (1, 2, 3...) for ordering
- Collection grid shows the "primary" journey poster (user can set which one)

### Rules
- First journey is created when you add the movie
- "Add New Journey" creates subsequent entries
- Each journey can have its own:
  - Date watched
  - Location
  - Who you watched with
  - First Take rating (your opinion might change!)
  - AI art (different poster per journey)
- Deleting last journey removes movie from collection

---

## Open Questions

1. **Primary journey:** Which poster shows in collection grid?
   - Recommendation: User can set "primary" journey, defaults to first

2. **Edit history?** Show when details were added/changed?
   - Recommendation: Not for MVP, maybe later

3. **Privacy:** WHO field - just names or link to other users?
   - Recommendation: Just text names for MVP, social links later

4. **Import:** Can users import from Letterboxd/other apps?
   - Recommendation: Future feature, would create basic journey cards
   
5. **Re-rating:** Different First Take per journey?
   - Recommendation: Yes! Your opinion can change on rewatch

---

## Effort Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Foundation | 8-12 hours | P0 - Do now |
| Phase 2: Location | 4-6 hours | P0 |
| Phase 3: Theater Integration | 4-6 hours | P1 |
| Phase 4: Social | 4-6 hours | P2 |
| Phase 5: AI Art | 12-20 hours | P1 |
| Phase 6: Achievements | 8-12 hours | P2 |

**Total MVP (Phase 1-2):** ~12-18 hours
**Full Feature:** ~40-60 hours

---

## Design Notes

- Journey card should feel premium, personal, "yours"
- Original movie poster as default, AI art as upgrade
- Keep movie details accessible but separate (don't duplicate TMDB info)
- Mobile-first - designed for scrolling through your collection
- Consider card flip animation to reveal details?

---

## Summary

The Journey Card transforms CineTrak from "movie list app" to "movie memory keeper." It:

1. **Captures the full experience** - not just what you watched, but the whole context
2. **Rewards engagement** - more data = richer cards = achievements
3. **Enables AI art** - gives the generated artwork a proper home
4. **Drives ticket scanning** - auto-fill makes scanning way more valuable
5. **Builds toward stats** - all this data enables amazing insights
6. **Creates monetization** - AI art, premium features, rarity mechanics
