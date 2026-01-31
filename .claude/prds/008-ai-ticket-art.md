# PRD: AI Ticket Art - Transform Tickets into Collectibles

## Overview
Turn boring movie tickets into beautiful, collectible artwork using AI image generation. This is CineTrak's unique differentiator.

## Vision
> "Your movie memories deserve to be beautiful."

A user scans a plain theater ticket. With one tap, AI transforms it into stylized artwork that matches the movie's vibe. Users build a gallery of beautiful ticket memories they want to share and revisit.

---

## Why This Matters

### Competitive Advantage
- Letterboxd doesn't have this
- No movie tracking app has this
- Transforms utility (logging) into emotion (collecting)

### Viral Potential
- Shareable on Instagram/TikTok
- "Look at my CineTrak collection" posts
- Visual content performs better on social

### Revenue Driver
- Premium feature people will pay for
- Per-ticket upsell opportunity
- Differentiates paid tiers

---

## User Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. SCAN TICKET                                             │
│     User scans movie ticket (existing flow)                 │
│     ↓                                                       │
│  2. PARSE & CONFIRM                                         │
│     "Dune: Part Two at AMC Boston - March 15, 2024"        │
│     ↓                                                       │
│  3. OFFER ART TRANSFORMATION                                │
│     ┌─────────────────────────────────────┐                │
│     │  ✨ Make this ticket special?        │                │
│     │                                      │                │
│     │  Transform your ticket into          │                │
│     │  collectible artwork!                │                │
│     │                                      │                │
│     │  [Create Art]  [Skip for now]        │                │
│     └─────────────────────────────────────┘                │
│     ↓                                                       │
│  4. GENERATING (if user taps Create)                        │
│     - Animated loading screen                               │
│     - Movie-themed loading messages                         │
│     - 5-15 seconds generation time                          │
│     ↓                                                       │
│  5. REVEAL                                                  │
│     - Dramatic reveal animation                             │
│     - Before/after comparison option                        │
│     - Share button prominent                                │
│     ↓                                                       │
│  6. SAVE TO COLLECTION                                      │
│     - Both original and art version stored                  │
│     - Accessible in ticket gallery                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Art Style Concepts

### Genre-Based Styles

| Genre | Art Style | Visual Elements |
|-------|-----------|-----------------|
| Action | Dynamic, bold | Motion lines, explosions, metallic |
| Horror | Dark, moody | Shadows, red accents, distressed |
| Comedy | Bright, playful | Warm colors, light, fun typography |
| Romance | Soft, dreamy | Pastels, hearts, elegant script |
| Sci-Fi | Futuristic, neon | Glowing elements, tech patterns |
| Drama | Sophisticated | Muted tones, artistic, film grain |
| Animation | Colorful, whimsical | Cartoon elements, vibrant |
| Documentary | Clean, journalistic | Bold typography, factual feel |

### Style Options for User

1. **Auto** (default) - AI picks based on movie genre
2. **Poster Match** - Mimics the movie's actual poster style
3. **Vintage** - Classic film noir / golden age cinema
4. **Minimalist** - Clean, modern, simple
5. **Pop Art** - Bold colors, comic book style
6. **Watercolor** - Soft, artistic, painterly

---

## Technical Architecture

### AI Options Comparison

| Service | Pros | Cons | Cost |
|---------|------|------|------|
| **Gemini Imagen** | Already using Gemini, integrated | Limited style control | ~$0.02/image |
| **OpenAI DALL-E 3** | High quality, good prompting | Separate API | ~$0.04/image |
| **Stability AI** | Cheapest, good quality | More setup | ~$0.002/image |
| **Midjourney** | Best quality | No API (yet) | N/A |
| **Replicate** | Many models, flexible | Variable quality | ~$0.01/image |

**Recommendation:** Start with **Stability AI** via API for cost efficiency, or **Gemini Imagen** if already integrated.

### Prompt Engineering

```typescript
function buildArtPrompt(ticketData: TicketData, style: ArtStyle): string {
  const genreStyle = getGenreStyle(ticketData.movieGenres);
  
  return `
    Create a stylized movie ticket artwork.
    
    Movie: "${ticketData.movieTitle}"
    Genre: ${ticketData.movieGenres.join(', ')}
    Style: ${style}
    
    Requirements:
    - Include the movie title prominently
    - Include the date: ${ticketData.date}
    - Include theater: ${ticketData.theaterName}
    - Match the ${genreStyle.description}
    - Format as a ticket/stub shape (landscape rectangle)
    - Include decorative elements matching the movie's theme
    - Make it feel like a collectible, premium keepsake
    
    Visual style: ${genreStyle.visualPrompt}
    
    Do NOT include: real actor faces, copyrighted logos
  `;
}
```

### Data Model

```sql
-- New table for ticket art
CREATE TABLE ticket_art (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user_movie_id UUID REFERENCES user_movies(id) ON DELETE CASCADE,
  original_ticket_url TEXT,           -- Original scanned ticket
  art_url TEXT,                       -- Generated artwork
  art_style TEXT,                     -- 'auto', 'vintage', 'minimalist', etc.
  generation_prompt TEXT,             -- Store for debugging/improvement
  generation_model TEXT,              -- 'stability-xl', 'gemini-imagen', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_ticket_art_user ON ticket_art(user_id);
CREATE INDEX idx_ticket_art_movie ON ticket_art(user_movie_id);
```

### Edge Function: Generate Art

```typescript
// supabase/functions/generate-ticket-art/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { userMovieId, style = 'auto' } = await req.json();
  
  // 1. Get movie data
  const supabase = createClient(/* ... */);
  const { data: movieData } = await supabase
    .from('user_movies')
    .select('*')
    .eq('id', userMovieId)
    .single();
  
  // 2. Get movie genres from TMDB
  const genres = await fetchTMDBGenres(movieData.tmdb_id);
  
  // 3. Build prompt
  const prompt = buildArtPrompt({
    movieTitle: movieData.title,
    movieGenres: genres,
    date: movieData.watched_at,
    theaterName: movieData.theater_name || 'Cinema',
  }, style);
  
  // 4. Generate image
  const imageUrl = await generateWithStability(prompt);
  
  // 5. Upload to Supabase Storage
  const storagePath = `ticket-art/${userMovieId}.png`;
  await supabase.storage.from('ticket-art').upload(storagePath, imageBlob);
  
  // 6. Save record
  await supabase.from('ticket_art').insert({
    user_id: userId,
    user_movie_id: userMovieId,
    art_url: getPublicUrl(storagePath),
    art_style: style,
    generation_prompt: prompt,
  });
  
  return new Response(JSON.stringify({ artUrl: getPublicUrl(storagePath) }));
});
```

---

## UI Components

### Art Generation Loading Screen

```
┌─────────────────────────────────────────┐
│                                         │
│            ✨ Creating Magic ✨          │
│                                         │
│         [Animated sparkle effect]       │
│                                         │
│     "Mixing the perfect colors..."      │
│     "Adding cinematic flair..."         │
│     "Capturing the movie magic..."      │
│                                         │
│         ████████████░░░░░░ 65%         │
│                                         │
└─────────────────────────────────────────┘
```

### Art Reveal Screen

```
┌─────────────────────────────────────────┐
│                    ✕                    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │     [GENERATED ARTWORK]         │   │
│  │                                 │   │
│  │     DUNE: PART TWO              │   │
│  │     March 15, 2024              │   │
│  │     AMC Boston                   │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│     [Share]  [Save]  [Regenerate]       │
│                                         │
│     Try another style: [Vintage ▾]      │
│                                         │
└─────────────────────────────────────────┘
```

### Ticket Gallery View

```
┌─────────────────────────────────────────┐
│  My Ticket Collection          [Grid/List]│
│                                         │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │     │ │     │ │     │ │     │       │
│  │ Art │ │ Art │ │ Art │ │Plain│       │
│  │     │ │     │ │     │ │     │       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
│  Dune    Barbie  Oppen..  Past..       │
│                                         │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │Plain│ │ Art │ │     │ │     │       │
│  │ +✨ │ │     │ │     │ │     │       │
│  │     │ │     │ │     │ │     │       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
│                                         │
│  [Create Art] for tickets without art   │
└─────────────────────────────────────────┘
```

---

## Monetization Integration

### Free Tier
- Cannot generate ticket art
- See preview of what art could look like
- "Upgrade to create ticket art!"

### CineTrak+ ($19.99/year)
- 3 ticket art generations per month
- Counter shown: "2 of 3 remaining this month"
- Can purchase additional: $0.99 for 3 more

### CineTrak Pro ($39.99/year)
- Unlimited ticket art
- All style options
- Regenerate as many times as desired

### Tracking Usage

```sql
-- Add to profiles table
ALTER TABLE profiles ADD COLUMN art_generations_this_month INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN art_generations_reset_at TIMESTAMPTZ;
```

---

## Sharing Features

### Share to Social
- Pre-formatted for Instagram Stories (9:16)
- Square format for feed posts
- Include subtle "Made with CineTrak" watermark (removable for Pro)

### Share Options
1. Save to Camera Roll
2. Share to Instagram
3. Share to Twitter/X
4. Copy link (web gallery view)

---

## Cost Analysis

### Per-Image Generation Costs

| Volume | Stability AI | Notes |
|--------|--------------|-------|
| 1,000 images/month | ~$2 | Early stage |
| 10,000 images/month | ~$20 | Growing |
| 100,000 images/month | ~$200 | Scale |

### Break-Even Analysis
- If 1 user generates 3 images/month = ~$0.006 cost
- CineTrak+ = $19.99/year = $1.67/month
- Profit margin: Excellent

---

## Timeline

| Phase | Tasks | Estimate |
|-------|-------|----------|
| **Phase 1** | Stability AI integration, basic generation | 8 hours |
| **Phase 2** | UI (loading, reveal, gallery) | 8 hours |
| **Phase 3** | Style options, prompt tuning | 4 hours |
| **Phase 4** | Monetization gates, usage tracking | 4 hours |
| **Phase 5** | Sharing features | 4 hours |
| **Phase 6** | Testing, refinement | 4 hours |
| **Total** | | **~32 hours** |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Art generation rate | 30%+ of scanned tickets |
| Share rate | 10%+ of generated art shared |
| Conversion driver | Top 3 reason for upgrades |
| User satisfaction | 4.5+ star feature rating |

---

## Open Questions

1. Should regeneration count against monthly limit?
2. Allow users to upload custom tickets (not just scans)?
3. Offer one-time purchase option outside subscription?
4. Create "art pack" DLC with special styles?

---

## Future Ideas

- **Seasonal styles** - Holiday themes, awards season gold
- **Movie-specific styles** - Partner with studios for official art
- **Community gallery** - Public showcase of best ticket art
- **Print-on-demand** - Physical prints/posters of ticket art
- **NFT integration** - (only if users want this, controversial)
