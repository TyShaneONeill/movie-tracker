# PRD: Ticket Stub Digital Preservation

**Status:** Draft
**Author:** Claude Code
**Created:** 2026-04-03
**Priority:** High — Core differentiator, builds on existing scanner infrastructure

---

## Problem Statement

Movie-goers who collect physical ticket stubs inevitably lose them — they fade, tear, or get thrown away. Cinetrak already scans tickets to extract metadata (title, theater, seat, showtime), but the **ticket image itself is discarded** after extraction. Users have no way to preserve the visual artifact of their movie-going experience.

## Goal

When a user scans a movie ticket, automatically crop and clean the image into a document-quality scan of just the ticket stub, then permanently attach it to that movie's journey. Users can browse their preserved ticket stubs within the journey detail page, creating a digital scrapbook of every movie they've seen in theaters.

## User Story

> As a movie-goer, I want to scan my physical ticket and have a clean digital copy saved to my journey, so I never lose the memory of that theater visit — even if the paper ticket gets lost or fades.

---

## Detailed Flow

### 1. Capture (Existing — No Changes)

User opens the Scanner tab and either:
- Takes a photo with the camera
- Selects an image from their gallery

This part of the flow is unchanged. The image is sent to the `scan-ticket` edge function as base64.

### 2. Document Crop (New)

**Before** the ticket metadata is extracted (or in parallel), the system produces a clean, cropped image of just the ticket stub.

#### Approach: Edge Function Processing

Add a `crop_ticket` step to the existing `scan-ticket` edge function (or create a new `crop-ticket-image` edge function) that:

1. **Receives** the raw photo (base64)
2. **Detects** the ticket boundary using the vision model (already in use for text extraction)
3. **Returns** crop coordinates: `{ x, y, width, height }` as normalized values (0-1) relative to the original image dimensions
4. **Client-side crop** using `expo-image-manipulator`:
   - Crop to the returned bounding box
   - Apply perspective correction if the ticket is skewed (manipulator supports rotation)
   - Auto-enhance contrast/brightness for readability
   - Output as JPEG at 90% quality (good balance of size vs. clarity)
   - Target resolution: long edge ~1500px (readable but not wasteful)

#### Why Client-Side Crop?

- Avoids sending/receiving full images twice over the network
- `expo-image-manipulator` already handles crop, resize, rotate
- Edge function only needs to return lightweight coordinate data
- Reduces edge function compute time and cost

#### Fallback

If the vision model can't confidently detect a ticket boundary (confidence < 0.7):
- Use the full original image (no crop)
- Flag it for the user on the review screen: "We couldn't auto-crop your ticket. You can adjust the crop manually."
- Provide a manual crop UI (see Section 3)

### 3. Review Screen Enhancement (Modified)

The existing review screen (`app/scan/review.tsx`) currently shows extracted metadata in cards. Add:

#### Ticket Preview

- **Above** the metadata card, show a preview of the cropped ticket image
- Aspect ratio: preserve original (tickets vary — landscape stubs, portrait receipts, square digital tickets)
- Rounded corners (12px) with a subtle shadow to mimic a physical stub
- Tap to open full-screen view

#### Manual Crop Adjustment

- Small "Adjust crop" button below the preview
- Opens a crop overlay on the original image with:
  - Draggable corner handles
  - Free aspect ratio (tickets come in all shapes)
  - Pinch-to-zoom on the source image
  - "Reset" button to revert to AI-detected crop
- Use `expo-image-manipulator` or a lightweight crop library (e.g., `react-native-image-crop-picker` already supports cropping)

#### Confirm & Save

When the user confirms the ticket:
1. Upload the cropped ticket image to Supabase Storage (`ticket-stubs` bucket)
2. Path format: `{user_id}/{journey_id}/ticket-stub-{timestamp}.jpg`
3. Store the public URL in the journey record
4. Proceed with existing flow (create journey, save metadata)

### 4. Storage (New)

#### Supabase Storage Bucket: `ticket-stubs`

| Setting | Value |
|---|---|
| Bucket name | `ticket-stubs` |
| Public | Yes (images served via CDN URL) |
| Max file size | 5 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |
| RLS | Users can only write to their own `{user_id}/` prefix |

#### Database Schema Change

Add a new field to the `user_movies` table:

```sql
ALTER TABLE user_movies
ADD COLUMN ticket_stub_urls text[] DEFAULT NULL;
```

**Why an array?**
- A single journey might involve multiple ticket stubs (e.g., you photographed both sides, or you have a companion's ticket too)
- Future-proofs for receipt scans, wristbands, etc.
- Consistent with the existing `journey_photos` pattern (also `text[]`)

#### Alternative Considered: Reuse `journey_photos`

We could store ticket stubs in the existing `journey_photos` array. **Rejected** because:
- `journey_photos` is for user-uploaded photos (selfies at the theater, etc.)
- Ticket stubs have distinct behavior (auto-cropped, shown in a dedicated carousel, visually styled differently)
- Separating them keeps the data model clean and allows independent UI treatment

### 5. Journey Detail Page — Ticket Stub Carousel (New)

The journey detail page (`app/journey/[id].tsx`) currently shows:
- Hero section (350px): movie poster or journey cover photo
- Perforated ticket edge divider
- Ticket flip card with metadata

#### New: Scrollable Hero

Replace the static hero image with a **horizontal paging carousel** in the hero section:

**Pages (in order):**

1. **Movie Poster** (always present) — TMDB poster or AI-generated poster (existing behavior)
2. **Ticket Stub(s)** — One page per ticket stub image from `ticket_stub_urls`
3. **Journey Photos** — Existing `journey_photos` if any

**Carousel Behavior:**
- Horizontal `FlatList` with `pagingEnabled={true}`
- Full-width pages (same 350px hero height)
- Page indicator dots at the bottom of the hero section
- Ticket stubs displayed with:
  - `contentFit: 'contain'` (show the full ticket, don't crop)
  - Subtle paper-white background behind the ticket (to contrast with dark theme)
  - Slight drop shadow to give depth
- Swipe left/right to navigate
- Tap any image to open full-screen inspection modal (reuse `PosterInspectionModal` pattern)

#### Visual Treatment for Ticket Stubs

When displaying a ticket stub page:
- Background: warm off-white (`#FAF8F5`) or subtle paper texture
- The ticket image is centered with padding (16px)
- A small label at the top: "TICKET STUB" in caption text
- Optional: very subtle paper grain overlay for tactile feel

### 6. Adding Ticket Stubs to Existing Journeys (New)

Not every user will scan their ticket through the Scanner tab. Some may want to add a ticket photo later.

#### From Journey Detail

- Add a "+" button in the hero carousel (shown as the last page)
- Tapping opens camera/gallery picker
- Selected image goes through the same crop flow (edge function for boundary detection → client-side crop → upload)
- Saved to `ticket_stub_urls` for that journey

#### From Journey Edit

- The existing journey edit screen should include a "Ticket Stubs" section
- Shows thumbnails of existing stubs with delete option
- "Add ticket stub" button triggers the same flow

---

## Technical Implementation

### Phase 1: Core Crop & Storage

**Edge Function Changes (`scan-ticket` or new `detect-ticket-bounds`):**
- Add a secondary prompt to the vision model asking for bounding box coordinates
- Return crop coordinates alongside the existing extracted fields
- Response shape addition:
  ```json
  {
    "ticketBounds": {
      "x": 0.12,
      "y": 0.05,
      "width": 0.76,
      "height": 0.88,
      "confidence": 0.92,
      "rotation": -2.5
    }
  }
  ```

**New Hook: `use-ticket-stub.ts`**
- `cropTicketImage(imageUri, bounds)` — calls `expo-image-manipulator`
- `uploadTicketStub(journeyId, croppedUri)` — uploads to Supabase Storage
- `deleteTicketStub(journeyId, stubUrl)` — removes from storage + updates DB

**Storage Setup:**
- Create `ticket-stubs` bucket with RLS policies
- Migration to add `ticket_stub_urls` column

**Review Screen (`scan/review.tsx`):**
- Show cropped ticket preview
- "Adjust crop" button with manual crop UI

### Phase 2: Journey Carousel

**Journey Detail (`journey/[id].tsx`):**
- Replace static hero with `FlatList` carousel
- Page indicator component
- Ticket stub visual styling (paper background, label)
- Full-screen tap-to-inspect

**Journey Edit:**
- Ticket stubs section with add/delete

### Phase 3: Polish & Retroactive

**Manual Add Flow:**
- "+" page in carousel for adding stubs to existing journeys
- Same crop pipeline, just without the metadata extraction step

**Batch Import (Stretch):**
- Photo library scan for ticket-like images (ML classification)
- Match to existing journeys by date proximity

---

## Data Model Summary

```
user_movies (existing table)
├── ticket_stub_urls: text[]     ← NEW: array of Supabase Storage URLs
├── journey_photos: text[]       (existing, unchanged)
├── ai_poster_url: text          (existing, unchanged)
├── poster_path: text            (existing, unchanged)
└── display_poster: text         (existing, unchanged)

ticket-stubs (new Supabase Storage bucket)
└── {user_id}/
    └── {journey_id}/
        ├── ticket-stub-1712345678.jpg
        └── ticket-stub-1712345999.jpg
```

---

## Rate Limiting & Premium Considerations

| Action | Free Tier | Premium |
|---|---|---|
| Ticket scans (existing) | 3/day | 20/day |
| Ticket stub storage | 10 stubs total | Unlimited |
| Manual crop adjustments | Included | Included |
| Stub image resolution | 1000px long edge | 1500px long edge |

Ticket stub storage counts are separate from scan limits — a scan that saves a stub counts as 1 scan + 1 stub storage slot.

---

## Success Metrics

- **Stub save rate**: % of ticket scans where the user keeps the cropped stub (target: >80%)
- **Manual crop rate**: % of stubs where user adjusts the auto-crop (target: <20%, indicating good auto-detection)
- **Retroactive adds**: # of stubs added to existing journeys (indicates feature discovery)
- **Retention signal**: Users with 3+ saved stubs should show higher 30-day retention

---

## Open Questions

1. **Multiple tickets per scan?** — Some users photograph multiple tickets at once (e.g., their ticket + partner's). Should we detect and crop multiple tickets from a single image?
2. **Ticket back-side?** — Some tickets have interesting info on the back. Support a "scan back" flow?
3. **Physical ticket dimensions overlay?** — Should we show the stub at approximate real-world scale (credit-card size reference)?
4. **Social sharing?** — Allow sharing a ticket stub image (with movie title overlay) to Instagram/Stories?
5. **Companion ticket linking?** — If a friend also uses Cinetrak, can their stub be linked to the same "watch party" journey?

---

## Out of Scope

- OCR improvements to the existing text extraction pipeline
- Theater loyalty card scanning
- Digital/mobile ticket screenshot parsing (different UX — future PRD)
- Ticket stub NFTs or blockchain verification
