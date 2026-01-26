# PRD: Movie Ticket Scanner Feature

## Overview

A feature that allows users to scan physical movie tickets using their phone camera, leveraging AI vision models to extract ticket information and automatically populate their "watched" movies list with rich metadata about their theater experience.

---

## Problem Statement

Users manually enter movie information when logging watched films. This is:
- Time-consuming and error-prone
- Missing valuable contextual data (theater, seat, showtime)
- Not capturing the "experience" of going to the movies

---

## Goals

### Primary Goals
1. **Reduce friction** - One photo scan vs. manual form entry
2. **Capture rich data** - Theater, seat, showtime, price, format (IMAX, Dolby, etc.)
3. **Cost efficiency** - Minimize AI API costs as user base scales
4. **Gamification** - Reward verified theater visits with badges/stats

### Success Metrics
- Reduction in time to log a movie (target: <10 seconds)
- User adoption rate of scan feature vs. manual entry
- AI extraction accuracy rate (target: >90%)
- Cost per scan (target: <$0.01)

---

## Feature Requirements

### Phase 1: Core Scanning (MVP)

#### P0 - Must Have
- [ ] Camera integration to capture ticket photos
- [ ] AI vision model integration for text extraction
- [ ] JSON schema for extracted ticket data
- [ ] Form auto-fill from extracted data
- [ ] Manual override/correction for AI mistakes
- [ ] Rate limiting: 3 AI scans per day (free tier)
- [ ] Unlimited manual entries

#### Extracted Data Schema (Target)
```json
{
  "movie_title": "string",
  "theater_name": "string",
  "theater_chain": "string | null",
  "showtime": "ISO8601 datetime",
  "date": "YYYY-MM-DD",
  "seat": {
    "row": "string | null",
    "number": "string | null"
  },
  "auditorium": "string | null",
  "format": "string | null",  // IMAX, Dolby, 3D, Standard
  "price": {
    "amount": "number | null",
    "currency": "string"
  },
  "ticket_type": "string | null",  // Adult, Child, Senior, Matinee
  "confirmation_number": "string | null",
  "raw_text": "string",  // Full OCR text for debugging
  "confidence_score": "number"  // 0-1, AI's confidence
}
```

### Phase 2: Verification & Gamification

#### P1 - Should Have
- [ ] "Verified Theater Visit" badge on movies logged via scan
- [ ] Theater visit statistics (private to user)
  - Most visited theaters
  - Favorite seat positions (if data available)
  - Spending trends
  - Format preferences (IMAX fan, etc.)
- [ ] Theater chain recognition and logo display

### Phase 3: Social & Discovery

#### P2 - Nice to Have
- [ ] Share "I'm at the movies" with ticket scan
- [ ] Theater check-ins and reviews
- [ ] "Movie buddy" detection (same theater, same showtime)

---

## Technical Considerations

### AI Model Options (Cost Analysis)

| Provider | Model | Cost per Image | Pros | Cons |
|----------|-------|----------------|------|------|
| **Google Cloud Vision** | OCR API | ~$0.0015/image | Excellent OCR, free tier (1000/mo) | Just OCR, no reasoning |
| **OpenAI** | GPT-4o-mini | ~$0.003/image | Good vision + reasoning | Rate limits |
| **OpenAI** | GPT-4o | ~$0.01/image | Best accuracy | Most expensive |
| **Anthropic** | Claude 3 Haiku | ~$0.002/image | Fast, cheap, good reasoning | Newer API |
| **Google** | Gemini Flash | ~$0.0001/image | Extremely cheap, free tier | Quality varies |
| **Ollama/Local** | LLaVA, etc. | Free (compute only) | No API costs | Requires server, slower |

#### Recommended Approach: Hybrid
1. **Primary**: Google Gemini Flash (near-free, good enough for tickets)
2. **Fallback**: Claude 3 Haiku or GPT-4o-mini if Gemini fails
3. **Future**: Self-hosted model if volume justifies server costs

### Architecture Options

#### Option A: Direct Client → AI API
```
Mobile App → AI Vision API → Parse Response → Save to Supabase
```
- Pros: Simple, low latency
- Cons: API keys on client (risky), no caching, hard to rate limit

#### Option B: Via Supabase Edge Function (Recommended)
```
Mobile App → Supabase Edge Function → AI Vision API → Return JSON
```
- Pros: API keys secure, rate limiting easy, can cache/log
- Cons: Slightly more complex, edge function limits

#### Option C: Dedicated Backend
```
Mobile App → Express/FastAPI Server → AI Vision API → Return JSON
```
- Pros: Full control, can run local models
- Cons: Infrastructure costs, maintenance

### Rate Limiting Strategy

```typescript
// Per-user limits stored in Supabase
interface UserScanLimits {
  user_id: string;
  daily_scans_used: number;
  daily_scans_limit: number;  // 3 for free, more for premium?
  last_reset: Date;
}
```

### Database Schema Additions

```sql
-- New table for theater visits
CREATE TABLE theater_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  movie_id INTEGER NOT NULL,  -- TMDB movie ID

  -- Extracted ticket data
  theater_name TEXT,
  theater_chain TEXT,
  showtime TIMESTAMPTZ,
  seat_row TEXT,
  seat_number TEXT,
  auditorium TEXT,
  format TEXT,
  price_amount DECIMAL(10,2),
  price_currency TEXT DEFAULT 'USD',
  ticket_type TEXT,
  confirmation_number TEXT,

  -- Verification
  ticket_image_url TEXT,  -- Optional: store original image
  is_verified BOOLEAN DEFAULT true,  -- Scanned = verified
  confidence_score DECIMAL(3,2),
  raw_ocr_text TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user stats queries
CREATE INDEX idx_theater_visits_user ON theater_visits(user_id);
CREATE INDEX idx_theater_visits_theater ON theater_visits(theater_name);

-- Rate limiting table
CREATE TABLE scan_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  daily_count INTEGER DEFAULT 0,
  last_scan_date DATE DEFAULT CURRENT_DATE,
  lifetime_scans INTEGER DEFAULT 0
);
```

---

## Privacy & Security

### Must Address
- [ ] Ticket images contain PII (confirmation numbers, sometimes names)
- [ ] Option to NOT store original ticket image
- [ ] Theater location data is private by default
- [ ] Clear data retention policy
- [ ] GDPR/CCPA compliance for location-related data

### Approach
- Extract data, then discard image (default)
- Optional "save ticket photo" for personal collection
- All theater stats private to user only
- No sharing of specific theater locations without explicit consent

---

## User Flow

### Happy Path
1. User taps "Scan Ticket" button
2. Camera opens with ticket frame guide
3. User captures photo of ticket
4. Loading state: "Reading your ticket..."
5. Preview screen shows extracted data
6. User confirms or edits any fields
7. TMDB lookup matches movie title
8. User adds rating/review (optional)
9. Movie saved with "Theater Visit" badge

### Error States
- Poor image quality → "Try again with better lighting"
- Can't find movie title → Manual TMDB search
- Daily limit reached → "You've used 3 scans today. Try manual entry or wait until tomorrow."
- AI extraction failed → "Couldn't read ticket. Please enter manually."

---

## Open Questions

1. **Image Storage**: Do we store original ticket images? (Privacy vs. keepsake value)
2. **Premium Tier**: Should unlimited scans be a premium feature?
3. **Receipt Support**: Should we also support digital receipts/email confirmations?
4. **Offline Mode**: Queue scans for when user is back online?
5. **Ticket Validation**: How do we prevent fake ticket submissions for badges?

---

## Implementation Phases

### Sprint 1: Research & Prototype
- [ ] Test 3 AI models with sample tickets
- [ ] Determine best cost/accuracy tradeoff
- [ ] Create Edge Function scaffold
- [ ] Define final JSON schema

### Sprint 2: Core Feature
- [ ] Implement camera capture component
- [ ] Build Edge Function for AI processing
- [ ] Create ticket preview/edit screen
- [ ] Integrate with existing "add movie" flow
- [ ] Add rate limiting

### Sprint 3: Polish & Stats
- [ ] Theater visit badge design
- [ ] Stats dashboard on profile
- [ ] Error handling edge cases
- [ ] Performance optimization

### Sprint 4: Testing & Launch
- [ ] Test with 50+ real tickets
- [ ] User acceptance testing
- [ ] Analytics integration
- [ ] Feature flag rollout

---

## Appendix

### Sample Tickets to Test
- [ ] AMC (digital & printed)
- [ ] Regal
- [ ] Cinemark
- [ ] Alamo Drafthouse
- [ ] Independent theaters
- [ ] Drive-in theaters
- [ ] International formats

### Competitive Analysis
- Letterboxd: No ticket scanning
- IMDb: No ticket scanning
- TV Time: No ticket scanning
- **Opportunity**: First major app with this feature

---

*Last Updated: 2025-01-23*
*Status: Draft - Pending Review*
