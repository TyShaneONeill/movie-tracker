# Showcase Cinemas — 2017 Non-IMAX (Standard Cardstock Stubs, Seekonk)

## Variant Overview
- **Chain**: Showcase Cinemas (National Amusements)
- **Location analyzed**: Showcase Cinemas Seekonk Route 6, Seekonk, MA
- **Ticket type**: Small cardstock stub — portrait orientation (taller than wide). Slightly larger than the 2017 IMAX square stub.
- **Visual identifiers**: Off-white cardstock. "SHOWCASE" printed in bold spaced block letters (NOT a watermark — actual printed text). "Auditorium N" label. 1D barcode at bottom. No QR code.
- **Era**: 2017 (same year as the IMAX stub variant, different location and format)
- **Website**: www.showcasecinemas.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Small cardstock stub in portrait orientation. Straightforward top-to-bottom layout with clear field separation. This is the standard (non-IMAX) Showcase ticket format for 2017.

1. **Location name** — "Seekonk Route 6" at the top. Uses the location name with road identifier, NOT "Showcase Cinemas Seekonk". The chain name appears separately below as "SHOWCASE".
2. **Presentation line + Code** — "Presenting" followed by a single letter code on the right side ("C" on most tickets, "S" on at least one). May indicate format or caption type.
3. **Movie title + Accessibility suffix** — bold font. Title followed by "-CCDV" suffix (e.g. "GET OUT-CCDV", "GUARD 2-CCDV"). "CCDV" likely = "Closed Captioning / Descriptive Video". Titles are truncated if long — only ~7 characters available for the title before the "-CCDV" suffix.
4. **MPAA rating** — standalone line (e.g. "PG13", "R").
5. **Showtime + Day + Date** — in a boxed/bordered area: "H:MMpm Day M/DD/YYYY" (e.g. "5:10pm Sat 3/4/2017", "7:00pm Wed 5/24/2017"). 12-hour format with am/pm, abbreviated day, **full 4-digit year**. Single-digit month has no leading zero.
6. **Ticket type + Price** — "TYPE $XX.XX" (e.g. "GA $9.75", "GA $12.50", "SPASS $0.00"). "GA" = General Admission, "SPASS" = Showcase Pass (free).
7. **"SHOWCASE"** — bold block-letter text, spaced out: "S H O W C A S E". This is the chain identifier — printed as actual text, not a watermark.
8. **Auditorium** — "Auditorium N" with explicit label (e.g. "Auditorium 6", "Auditorium 9", "Auditorium 4").
9. **1D Barcode** — traditional barcode at the bottom.
10. **Transaction number** — long numeric string below the barcode (e.g. "0068501901620006").
11. **Date + Time of sale** — "M/DD/YYYY H:MMpm" (e.g. "3/4/2017 4:56pm"). This is the PURCHASE timestamp, not the showtime.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **"-CCDV" suffix on every title**: Similar to AMC's "AD CC", Showcase appends "-CCDV" (Closed Captioning / Descriptive Video) to every movie title. The dash before "CCDV" distinguishes it from AMC's space-separated "AD CC". Strip "-CCDV" before extraction.
- **Severe title truncation**: The title field has room for only ~7 characters before the "-CCDV" suffix. Long titles are aggressively shortened:
  - "GET OUT-CCDV" = "Get Out" (fits — short title)
  - "GOING-CCDV" = "Going in Style" (drops "in Style")
  - "GUARD 2-CCDV" = "Guardians of the Galaxy Vol. 2" (drops almost everything, keeps "GUARD" + sequel number "2")
  - "FOUNDE-CCDV" = "The Founder" (drops "The", cuts "Founder" to "FOUNDE" mid-word)
- **Sequel number preservation**: "GUARD 2" shows the system preserves the sequel number even when the title is heavily truncated. "Guardians of the Galaxy Vol. 2" → "GUARD 2" keeps the "2" for disambiguation.
- **Mid-word AND whole-word truncation**: Unlike AMC which consistently uses one method, Showcase 2017 mixes approaches — "GOING" drops whole words ("in Style"), while "FOUNDE" cuts "Founder" mid-word (drops the "R"). Gemini must handle both.
- **"GA" = General Admission**: Standard ticket type. No reserved seating — unlike later Showcase variants (21-22 "GAR" = General Admission Reserved with seats, 24 with full seat info).
- **"SPASS" = Showcase Pass ($0.00)**: A free pass/comp ticket. "SPASS" likely = "Showcase Pass" or "S-Pass". The $0.00 price confirms it's a promotional/loyalty redemption. This is the ONLY free ticket across all analyzed chains.
- **"SHOWCASE" as printed text**: Unlike the 21-22 and 24 variants which use a diagonal "SHOWCASE CINEMA DE LUX" watermark, this 2017 variant prints "SHOWCASE" as bold, spaced block text. This is easier for OCR to detect as the chain identifier.
- **Location format**: "Seekonk Route 6" — uses the town name + road. Different from Providence which uses the mall name ("Providence Place Cinema" on IMAX) or just "Providence" (on 21-22). Map to "Showcase Cinemas Seekonk".
- **"Presenting" + single letter code**: "Presenting C" appears on most tickets; one ticket shows "Presenting S" (or "$"). The meaning of "C" vs "S" is unclear — possibly "C" = Captioned (matching CCDV), "S" = Standard. Not critical for extraction.
- **No seat info**: "GA" (General Admission) means no reserved seating at this location/era. Later variants added reserved seating (21-22 "GAR", 24 full seat assignments).
- **Barcode, NOT QR code**: 1D barcode, same as the 2017 IMAX variant. QR codes appear on later Showcase variants (21-22 onward).
- **Time of sale can be AFTER showtime**: Ticket 1 (Going in Style) has a showtime of 7:20pm but a sale time of 7:32pm — 12 minutes after the movie supposedly started. Likely purchased during previews/trailers at the box office. Gemini must still extract the 7:20pm SHOWTIME, not the 7:32pm sale time.
- **Full 4-digit year**: Consistent across all Showcase variants (2017, 21-22, 24).
- **Coin in photo**: A coin appears in the top-left corner for scale reference — not ticket data.

## Differences from 2017 IMAX Variant

| Feature | 17 Non-IMAX (Standard) | 17 IMAX (Stub) |
|---|---|---|
| Form factor | Portrait cardstock stub | Square cardstock stub |
| Location name | "Seekonk Route 6" | "Providence Place Cinema" |
| Chain text | "SHOWCASE" in bold blocks | Not printed |
| Format in title | "-CCDV" suffix | "IMAX" appended |
| Presentation line | "Presenting C" / "Presenting S" | "Presenting in" |
| Auditorium label | "Auditorium N" (explicit) | Just the number "17" (no label) |
| Ticket type | "GA" / "SPASS" | "SE" (unclear) |
| Price visibility | Clear ($9.75, $12.50, $0.00) | Partially faded (~$19.25) |
| Scannable code | 1D barcode | QR code |
| Seat info | No (General Admission) | Not visible |

## Raw Field Extraction

### showcase-17-nonIMAX-4_Movies.HEIC

> Note: This single image contains FOUR tickets from the same Showcase Cinemas Seekonk location. A coin is visible for scale.

#### Ticket 1: Going in Style (top left)

| Field | Raw Value |
|---|---|
| Location | Seekonk Route 6 |
| Presenting Code | S (or $) |
| Movie | GOING-CCDV (truncated from "Going in Style") |
| MPAA Rating | PG13 |
| Showtime | 7:20pm |
| Day | Sat |
| Date | 4/8/2017 |
| Ticket Type | PT1 (partially illegible — possibly a pass type or faded pricing) |
| Ticket Price | Unknown (obscured/faded) |
| Auditorium | 6 |
| Barcode | Yes (1D) |
| QR Code | NA |
| Transaction # | 0068639801150004 |
| Date/Time of Sale | 4/8/2017 7:32pm |

**Observations:**
- Going in Style (PG-13) released April 7, 2017. April 8, 2017 was a Saturday — opening weekend. Confirmed.
- Title truncated: "GOING-CCDV" — drops "in Style" entirely. Only the first word "GOING" fits.
- **Time of sale (7:32pm) is AFTER showtime (7:20pm)** — purchased 12 minutes after the listed showtime. Likely bought at box office during previews/trailers. This is the only ticket in the entire collection where sale time exceeds showtime.
- "PT1" in the ticket type position — meaning unclear. Could be "Pass Type 1", a pricing tier, or a partially printed/faded line. The price is not clearly readable.
- "Presenting S" (or "$") — different code from the "C" on the other three tickets. May indicate a different presentation format or be a printing artifact.
- Transaction # ends in "0004" — fourth ticket in a purchase or sequence.

---

#### Ticket 2: Get Out (top right)

| Field | Raw Value |
|---|---|
| Location | Seekonk Route 6 |
| Presenting Code | C |
| Movie | GET OUT-CCDV |
| MPAA Rating | R |
| Showtime | 5:10pm |
| Day | Sat |
| Date | 3/4/2017 |
| Ticket Type | GA |
| Ticket Price | $9.75 |
| Auditorium | 9 |
| Barcode | Yes (1D) |
| QR Code | NA |
| Transaction # | 0068501901620006 |
| Date/Time of Sale | 3/4/2017 4:56pm |

**Observations:**
- Get Out (R) released February 24, 2017. March 4, 2017 (Saturday) is second weekend. Confirmed.
- Title fits completely — "GET OUT" is short enough. Only the "-CCDV" suffix is appended.
- "GA" = General Admission at $9.75 — Saturday afternoon pricing. This is the cheapest paid ticket in the batch.
- Time of sale 4:56pm, showtime 5:10pm — 14 minutes before showtime.
- This was a massive cultural phenomenon — Get Out earned $255M worldwide on a $4.5M budget.

---

#### Ticket 3: Guardians of the Galaxy Vol. 2 (bottom left)

| Field | Raw Value |
|---|---|
| Location | Seekonk Route 6 |
| Presenting Code | C |
| Movie | GUARD 2-CCDV (truncated from "Guardians of the Galaxy Vol. 2") |
| MPAA Rating | PG13 |
| Showtime | 7:00pm |
| Day | Wed |
| Date | 5/24/2017 |
| Ticket Type | GA |
| Ticket Price | $12.50 |
| Auditorium | 4 |
| Barcode | Yes (1D) |
| QR Code | NA |
| Transaction # | 0028812400170011 |
| Date/Time of Sale | 5/24/2017 6:59pm |

**Observations:**
- Guardians of the Galaxy Vol. 2 (PG-13) released May 5, 2017. May 24, 2017 (Wednesday) is about 3 weeks after release. Confirmed.
- **Most aggressively truncated title in the entire collection**: "GUARD 2-CCDV" — the full "Guardians of the Galaxy Vol. 2" (35 characters) is reduced to "GUARD 2" (7 characters). The sequel number "2" is preserved even though the rest of the title is dropped.
- "GA" = General Admission at $12.50 — Wednesday evening pricing. $2.75 more than Saturday afternoon ($9.75), confirming evening/matinee price tiers exist.
- Time of sale 6:59pm, showtime 7:00pm — 1 minute before showtime! The closest purchase-to-showtime gap in the entire collection.
- Same Auditorium 4 as The Founder ticket — may be a mid-size screen at this location.

---

#### Ticket 4: The Founder (bottom right)

| Field | Raw Value |
|---|---|
| Location | Seekonk Route 6 |
| Presenting Code | C |
| Movie | FOUNDE-CCDV (truncated from "The Founder") |
| MPAA Rating | PG13 |
| Showtime | 6:50pm |
| Day | Tue |
| Date | 2/7/2017 |
| Ticket Type | SPASS |
| Ticket Price | $0.00 |
| Auditorium | 4 |
| Barcode | Yes (1D) |
| QR Code | NA |
| Transaction # | 0058407603120001 |
| Date/Time of Sale | 2/7/2017 6:48pm |

**Observations:**
- The Founder (PG-13) released January 20, 2017 (wide). February 7, 2017 (Tuesday) is ~2.5 weeks after release. Confirmed.
- Title truncated: "FOUNDE-CCDV" — drops "The" prefix and cuts "Founder" to "FOUNDE" (mid-word, missing "R"). The "R" may be present but cut off at the ticket edge (slight wear visible on right side).
- **"SPASS" = Showcase Pass at $0.00** — the only FREE ticket in the entire collection. "SPASS" likely stands for "Showcase Pass" — a loyalty/promo redemption. This is an important edge case: Gemini should still extract the movie data even when the price is $0.00.
- Time of sale 6:48pm, showtime 6:50pm — 2 minutes before showtime.
- Same Auditorium 4 as Guardians 2. This may be a preferred auditorium or just a frequently used mid-size screen.
- Transaction # ends in "0001" — first (or only) ticket in this purchase.
- This is the earliest ticket chronologically in the batch (February 2017).

## Pricing Analysis (Showcase Seekonk 2017)

| Movie | Day | Time | Type | Price | Notes |
|---|---|---|---|---|---|
| The Founder | Tue | 6:50pm | SPASS | $0.00 | Free pass (Showcase Pass) |
| Get Out | Sat | 5:10pm | GA | $9.75 | Saturday afternoon |
| Going in Style | Sat | 7:20pm | PT1? | Unknown | Saturday evening (faded) |
| Guardians 2 | Wed | 7:00pm | GA | $12.50 | Wednesday evening |

- **Afternoon vs Evening**: Saturday afternoon $9.75 vs Wednesday evening $12.50 — $2.75 difference. Evening pricing applies regardless of the day of week.
- **Free passes exist**: "SPASS" $0.00 proves Showcase had a pass/redemption system in 2017.
- **Compare to IMAX**: The IMAX ticket from the same year at Providence was ~$19.25 — nearly double the standard GA evening price.

## Showcase 2017 Title Encoding Pattern

Title format: `{MOVIE_TITLE}-CCDV`

| Full Movie Title | Printed Title | Characters Used | Truncation Type |
|---|---|---|---|
| Get Out | GET OUT-CCDV | 7 (full) | None |
| Going in Style | GOING-CCDV | 5 | Whole words dropped ("in Style") |
| Guardians of the Galaxy Vol. 2 | GUARD 2-CCDV | 7 | Heavy truncation, sequel # preserved |
| The Founder | FOUNDE-CCDV | 6 | "The" dropped, "Founder" cut mid-word |

- "-CCDV" suffix (5 chars + dash) is appended to ALL titles — "Closed Captioning / Descriptive Video".
- Title field limit: ~7 characters for the movie name before "-CCDV".
- Truncation is inconsistent: sometimes whole words are dropped, sometimes mid-word cuts. The sequel number "2" is preserved even when the rest of the title is truncated.
- Compare to AMC's "AD CC" which uses spaces instead of a dash and allows ~12 characters for the title.

## Golden JSON

```json
[
  {
    "id": "showcase-17-nonIMAX-001",
    "image_path": "showcase/showcase-17-nonIMAX-4_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Seekonk 2017. 'GOING-CCDV' = 'Going in Style'. Price/type partially illegible ('PT1'). Time of sale (7:32pm) is AFTER showtime (7:20pm) — bought during previews. 'Presenting S' code differs from other tickets.",
    "expected": {
      "movie_title": "Going in Style",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinemas Seekonk",
      "theater_location": "Seekonk, MA",
      "showtime": "2017-04-08T19:20:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "6",
      "ticket_price": null,
      "confidence_score": 0.75
    }
  },
  {
    "id": "showcase-17-nonIMAX-002",
    "image_path": "showcase/showcase-17-nonIMAX-4_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Seekonk 2017. 'GET OUT-CCDV' — title fits completely. GA = General Admission (no reserved seats). Saturday afternoon pricing $9.75. Opening weekend + 1 for Jordan Peele's debut thriller.",
    "expected": {
      "movie_title": "Get Out",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinemas Seekonk",
      "theater_location": "Seekonk, MA",
      "showtime": "2017-03-04T17:10:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "9",
      "ticket_price": {
        "amount": 9.75,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "showcase-17-nonIMAX-003",
    "image_path": "showcase/showcase-17-nonIMAX-4_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Seekonk 2017. Most aggressively truncated title: 'GUARD 2-CCDV' = 'Guardians of the Galaxy Vol. 2' (35 chars → 7). Sequel number preserved. Evening GA pricing $12.50. Bought 1 min before showtime.",
    "expected": {
      "movie_title": "Guardians of the Galaxy Vol. 2",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinemas Seekonk",
      "theater_location": "Seekonk, MA",
      "showtime": "2017-05-24T19:00:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "4",
      "ticket_price": {
        "amount": 12.50,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "showcase-17-nonIMAX-004",
    "image_path": "showcase/showcase-17-nonIMAX-4_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Seekonk 2017. 'FOUNDE-CCDV' = 'The Founder' (mid-word truncation). SPASS = Showcase Pass — FREE ticket ($0.00). Only comp ticket in entire collection. Earliest ticket in batch (Feb 2017).",
    "expected": {
      "movie_title": "The Founder",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinemas Seekonk",
      "theater_location": "Seekonk, MA",
      "showtime": "2017-02-07T18:50:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "4",
      "ticket_price": {
        "amount": 0.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  }
]
```
