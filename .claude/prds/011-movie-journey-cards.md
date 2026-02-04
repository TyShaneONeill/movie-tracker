# PRD: Movie Journey Cards - Personal Movie Experiences

## Overview
Transform the collection from a simple movie list into a gallery of personal movie experiences. Each movie in your collection becomes a "Journey Card" — a movie ticket-style card that captures YOUR relationship with that movie.

## Vision
> "Every movie you watch is a memory. We help you keep it."

---

## Design Direction

### The Ticket Metaphor
Journey cards look and feel like premium movie tickets:
- Fixed height card (like a real ticket)
- Perforated edge visual between sections
- Barcode + ticket ID at bottom
- "THEATRICAL RUN" or location badge on hero image
- Swipeable for multiple viewings

### UI Reference (from Gemini)
```
┌─────────────────────────────────────────────────────────┐
│  ←      MY JOURNEY: Dune: Part Two              ✏️     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │         [Hero Image / AI Poster]                │   │
│  │                    ┌──────────────┐             │   │
│  │                    │THEATRICAL RUN│             │   │
│  │                    └──────────────┘             │   │
│  │                                                  │   │
│  │                     ● ○ ○                       │   │  ← Journey carousel
│  ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤   │  ← Perforated edge
│  │  Dune: Part Two                                 │   │
│  │  ⭐ 10 • Masterpiece                            │   │
│  │                                                  │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ DATE          CINEMA                     │   │   │
│  │  │ Mar 1, 2024   IMAX Metreon              │   │   │
│  │  │                                          │   │   │
│  │  │ SEAT          WITH                       │   │   │
│  │  │ H-12, H-13    Sarah                      │   │   │
│  │  │                        ● ○               │   │   │  ← Info carousel
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                  │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ "The visuals were absolutely insane.    │   │   │
│  │  │  Needs to be seen on the biggest        │   │   │
│  │  │  screen possible."                      │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                  │   │
│  ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤   │
│  │  ID: 8X92-MM24              |||||||||||||||  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [+ Add New Journey]                                    │
└─────────────────────────────────────────────────────────┘
```

---

## First Take vs Journey Notes (IMPORTANT)

These are TWO DIFFERENT concepts:

| | First Take | Journey Notes |
|---|---|---|
| **Scope** | One per movie (movie-level) | One per journey (viewing-level) |
| **Purpose** | Your public rating/review | Personal notes about this specific viewing |
| **Editable?** | NO — it's your FIRST take | YES — your private memory |
| **Visibility** | Public (appears in feeds) | Private (only you see it) |
| **Example** | "9/10 - Incredible visuals" | "The IMAX really made this pop" |

### Behavior on Journey Card:
- **First Take** displayed as read-only reference (⭐ rating + tagline)
- If no First Take exists: show prompt "Add your First Take?" → links to First Take flow
- **Journey Notes** are editable per journey in the Edit screen
- Multiple journeys all reference the SAME First Take (it doesn't change per viewing)

---

## Info Carousel (Within Ticket)

Fixed ticket height with swipeable info sections:

### Page 1 — Core Info (always visible first)
| Field | Example |
|-------|---------|
| Date | Mar 1, 2024 |
| Cinema/Location | IMAX Metreon |
| Seat(s) | H-12, H-13 |
| With | Sarah |

### Page 2 — Extended Details (swipe to see)
| Field | Example |
|-------|---------|
| Time | 7:00 PM |
| Format | IMAX |
| Auditorium | Theater 4 |
| Ticket Price | $18.50 |

### Page 3 — Additional (if needed)
| Field | Example |
|-------|---------|
| Ticket ID | 8X92-MM24 |
| Platform | Theatrical |
| Location Type | Theater |

**Carousel indicators:** Small dots below the info section showing current page.

---

## Edit Journey Screen

### Structure:
```
┌─────────────────────────────────────────────────────────┐
│  Cancel          Edit Journey                    Save   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  MEMORIES                                        │   │
│  │  Add photos of your ticket, poster, or friends. │   │
│  │  First photo will be the cover.                 │   │
│  │                                                  │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐              │   │
│  │  │ Poster │ │ Ticket │ │   +    │              │   │
│  │  │   ✕    │ │   ✕    │ │  Add   │              │   │
│  │  └────────┘ └────────┘ └────────┘              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  DETAILS                                         │   │
│  │                                                  │   │
│  │  Review Title or Tagline                        │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ Masterpiece                              │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                  │   │
│  │  Rating (1-10)                                  │   │
│  │  ━━━━━━━━━━━━━━━━━━━━●━━━━━  9.2               │   │  ← RED slider
│  │                                                  │   │
│  │  Thoughts / Notes                               │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ The visuals were absolutely insane.     │   │   │
│  │  │ Needs to be seen on the biggest screen  │   │   │
│  │  │ possible.                               │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  LOGISTICS                                       │   │
│  │                                                  │   │
│  │  Date              Time                         │   │
│  │  ┌───────────┐     ┌───────────┐               │   │
│  │  │ 03/01/2024│     │ 07:00 PM  │               │   │
│  │  └───────────┘     └───────────┘               │   │
│  │                                                  │   │
│  │  Location                                       │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ IMAX Metreon                             │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                  │   │
│  │  Seat(s)           Format                       │   │
│  │  ┌───────────┐     ┌───────────────┐           │   │
│  │  │ H-12, H-13│     │ IMAX      ▼   │           │   │
│  │  └───────────┘     └───────────────┘           │   │
│  │                                                  │   │
│  │  Auditorium        Ticket Price                 │   │
│  │  ┌───────────┐     ┌───────────┐               │   │
│  │  │ Theater 4 │     │ $18.50    │               │   │
│  │  └───────────┘     └───────────┘               │   │
│  │                                                  │   │
│  │  Ticket ID                                      │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ 8X92-MM24                                │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  WHO WAS THERE?                                  │   │
│  │                                                  │   │
│  │  ┌──────────────┐  ┌─────────────────┐         │   │
│  │  │ 👤 Sarah  ✕  │  │  + Add Friend   │         │   │
│  │  └──────────────┘  └─────────────────┘         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Delete Journey                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Edit Screen Fields:

**MEMORIES**
- Photo gallery (ticket, poster, friends, etc.)
- First photo = cover image on journey card
- X button on each to remove
- "+ Add Photo" to add more

**DETAILS**
- Review Title / Tagline (e.g., "Masterpiece")
- Rating slider (1-10, RED color to match First Take)
- Thoughts / Notes (multiline text, journey-specific)

**LOGISTICS**
- Date (date picker)
- Time (time picker)
- Location (text field — theater name, "Home", etc.)
- Seat(s) (text field)
- Format (dropdown: Standard, IMAX, Dolby, 3D, 4K, etc.)
- Auditorium (text field)
- Ticket Price (currency field)
- Ticket ID (text field — for barcode display)

**WHO WAS THERE?**
- Chips for each person
- X on chip to remove
- "+ Add Friend" button
- Empty section = solo viewing (no explicit "Solo" chip needed)

---

## Multiple Journeys

Users can watch the same movie multiple times — each viewing is a separate journey.

### Journey Carousel (on view screen)
- Swipe left/right to navigate between journeys
- Dots indicate current journey (● ○ ○)
- "Journey 1 of 3" label
- Each journey has its own:
  - Cover photo / poster
  - Date & logistics
  - Notes
  - Who was there
  - AI art (if generated)

### Adding New Journey
- "Add New Journey" button at bottom of screen
- Creates new journey entry for same movie
- Opens Edit Journey screen for new entry

### Data Model
- Each journey = separate row in database
- Same `tmdb_id`, same `user_id`, different `id` and `created_at`
- `journey_number` field (1, 2, 3...) for ordering
- Collection grid shows primary journey poster (most recent or user-selected)

---

## AI Poster Integration (Premium Feature)

### Where It Lives
- Hero image area on journey card
- Can swap between original poster and AI-generated art
- Each journey can have its own AI poster

### Generation Flow
1. User taps "✨ Generate AI Art" on journey card
2. Premium check (if not premium, show upgrade prompt)
3. AI generates artwork based on movie
4. Rarity roll determines quality tier
5. Art saved to journey, becomes selectable as cover

### Rarity System
| Rarity | Chance | Visual Effect |
|--------|--------|---------------|
| Common | 60% | Standard AI art |
| Uncommon | 25% | Subtle shimmer |
| Rare | 12% | Animated sparkle border |
| Holographic | 3% | Full holographic animation |

### Business Model
- **Free users:** Cannot generate, can view others' shared art
- **Premium:** X generations per month included
- **Pay-per-generate:** One-time purchase for single generation
- **Re-roll:** Pay to try for higher rarity

---

## Data Model

### New/Updated Fields for user_movies
```sql
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS (
  -- Journey identification
  journey_number INT DEFAULT 1,
  
  -- When
  watched_at TIMESTAMPTZ,
  watch_time TIME,
  
  -- Where
  location_type TEXT,        -- 'theater', 'home', 'airplane', etc.
  location_name TEXT,        -- "IMAX Metreon", "Home", etc.
  
  -- Theater-specific
  auditorium TEXT,
  seat_location TEXT,
  ticket_price DECIMAL(6,2),
  ticket_id TEXT,            -- For barcode display
  watch_format TEXT,         -- 'imax', 'dolby', '3d', 'standard', '4k'
  
  -- Social
  watched_with TEXT[],       -- Array of names
  
  -- Notes (journey-specific, NOT First Take)
  journey_notes TEXT,
  journey_tagline TEXT,      -- "Masterpiece", etc.
  
  -- Media
  journey_photos TEXT[],     -- Array of photo URLs
  cover_photo_index INT DEFAULT 0,
  
  -- AI Art
  ai_poster_url TEXT,
  ai_poster_rarity TEXT,     -- 'common', 'uncommon', 'rare', 'holographic'
  display_poster TEXT DEFAULT 'original', -- 'original' or 'ai_generated'
  
  -- Metadata
  journey_created_at TIMESTAMPTZ DEFAULT NOW(),
  journey_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_movies_journey ON user_movies(user_id, tmdb_id, journey_number);
CREATE INDEX idx_user_movies_watched_at ON user_movies(user_id, watched_at);
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)
**Goal:** Basic journey card view and edit

- [ ] Database migration: Add journey fields to user_movies
- [ ] Journey Card screen (view mode)
  - [ ] Ticket-style UI layout
  - [ ] Hero image area
  - [ ] Title + First Take rating (read-only)
  - [ ] Info section with core fields
  - [ ] Notes/review display
  - [ ] Barcode footer
- [ ] Edit Journey screen
  - [ ] MEMORIES section (photo upload)
  - [ ] DETAILS section (tagline, rating slider RED, notes)
  - [ ] LOGISTICS section (all fields from ticket scanning)
  - [ ] WHO WAS THERE section (chips + add/remove)
  - [ ] Delete Journey button
- [ ] Navigation: Collection grid → Journey Card
- [ ] Edit button on journey card → Edit Journey

### Phase 2: Info Carousel
**Goal:** Swipeable info pages within ticket

- [ ] Implement horizontal carousel for info section
- [ ] Page 1: Core info (date, location, seat, with)
- [ ] Page 2: Extended details (time, format, auditorium, price)
- [ ] Dot indicators for current page
- [ ] Smooth swipe animations

### Phase 3: Multiple Journeys
**Goal:** Support rewatches

- [ ] Journey carousel on view screen
- [ ] "Add New Journey" flow
- [ ] Journey number tracking
- [ ] Swipe between journeys
- [ ] Primary journey selection for collection grid

### Phase 4: Ticket Scanning Integration
**Goal:** Auto-populate from scanned tickets

- [ ] Connect ticket scan results to journey creation
- [ ] Pre-fill all logistics fields
- [ ] Attach ticket photo to MEMORIES
- [ ] Update existing ticket scan flow to create journey

### Phase 5: AI Art Integration
**Goal:** Premium poster generation

- [ ] "Generate AI Art" button
- [ ] Premium gate check
- [ ] AI generation API integration
- [ ] Rarity roll system
- [ ] Poster selection (original vs AI)
- [ ] Visual effects for rarity tiers

### Phase 6: Polish & Achievements
**Goal:** Delight and engagement

- [ ] Perforated edge animations
- [ ] Haptic feedback on interactions
- [ ] Location-based achievements
- [ ] Stats integration
- [ ] Share journey as image

---

## Technical Notes

### Components to Create
1. `JourneyCardScreen` — Main view screen
2. `EditJourneyScreen` — Edit modal/screen
3. `JourneyTicket` — The ticket-style card component
4. `InfoCarousel` — Swipeable info section
5. `JourneyCarousel` — Swipe between multiple journeys
6. `MemoriesSection` — Photo gallery with upload
7. `WhoWasThereSection` — Friend chips
8. `JourneyBarcode` — Ticket ID + barcode visual

### Existing Components to Modify
- Collection grid: Navigate to journey instead of movie details
- Ticket scanning: Create journey on successful scan
- First Take: Display on journey card (read-only)

---

## Success Metrics

- **Engagement:** Time spent on journey cards
- **Completion:** % of journeys with 3+ fields filled
- **Ticket scans:** Increase after journey card launch
- **Retention:** Users with 5+ journeys retention rate
- **Revenue:** AI art generation conversion rate

---

## Summary

The Journey Card transforms CineTrak from "movie list app" to "movie memory keeper" with:

1. **Ticket metaphor** — Beautiful, collectible card design
2. **First Take + Notes separation** — Public rating stays sacred, private notes per viewing
3. **Info carousel** — Clean fixed-height design with swipeable details
4. **Multiple journeys** — Every rewatch is a new memory
5. **AI art integration** — Premium collectible posters
6. **Ticket scanning synergy** — Auto-fill makes scanning valuable
