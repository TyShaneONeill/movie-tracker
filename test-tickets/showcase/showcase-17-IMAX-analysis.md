# Showcase Cinema — 2017 IMAX (Small Square Stub)

## Variant Overview
- **Chain**: Showcase Cinema / National Amusements (same parent as Showcase Cinema de Lux)
- **Location analyzed**: Providence Place Cinema (IMAX), Providence, RI
- **Ticket type**: Small cardstock stub — approximately square, NOT the tall vertical thermal receipt of later years
- **Visual identifiers**: Small, square-ish ticket. No "SHOWCASE CINEMA DE LUX" watermark. Plain off-white cardstock. Text printed in a rotated orientation. QR code in one corner. Large bold auditorium number.
- **Era**: 2017
- **Website**: www.showcasecinemas.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Small square cardstock ticket stub — a completely different form factor from the 2021-22 vertical thermal receipt and the 2024 horizontal thermal receipt. The ticket is roughly square (wider than tall in the intended reading orientation). Text is printed in a condensed format. Reading the ticket in its intended orientation:

1. **Venue name** — "Providence Place Cinema" printed vertically along one edge. Note: this does NOT say "Showcase Cinema de Lux" — it uses the venue/mall name instead. This is the IMAX theater at Providence Place Mall, operated by National Amusements (Showcase's parent).
2. **Format line** — "Presenting in" (or "Presented in") — an IMAX branding/format descriptor.
3. **Movie title + Format** — "FAST 8 IMAX" — movie title with format embedded. "IMAX" is appended to the title similar to how AMC appends format names.
4. **MPAA rating** — "PG13".
5. **Showtime + Day + Date** — "11:30 AM Sat 4/15/2017". 12-hour format with AM/PM, abbreviated day, **full 4-digit year** (MM/DD/YYYY). Same date format as the 21-22 Showcase variant.
6. **Price/ticket info** — partially illegible due to fading. Appears to contain dollar amount(s) and a ticket category code. Best reading: approximately $19.25 with "SE" category designation. The exact breakdown is unclear.
7. **Auditorium number** — large bold "17" on the right side of the ticket. Same Theatre 17 as later Showcase Providence tickets (likely the permanent IMAX screen).
8. **QR code** — in the top-right corner area.
9. **Transaction number** — long numeric string along the right edge.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **"Providence Place Cinema" ≠ "Showcase Cinema de Lux"**: This 2017 IMAX ticket prints the VENUE name ("Providence Place Cinema") instead of the CHAIN name. The theater is operated by National Amusements / Showcase, but the printed name references the Providence Place Mall where the IMAX is located. Map `theater_chain` to "Showcase Cinema de Lux" (or "Showcase") and `theater_name` to "Providence Place Cinema IMAX" as printed.
- **Format embedded in title**: "FAST 8 IMAX" — "IMAX" is appended to the movie title, similar to AMC's approach with "DOLBY". The actual movie title is "Fast 8" (a.k.a. "The Fate of the Furious"). Strip "IMAX" from the title and use it as the `format` field.
- **"Fast 8" vs official title**: The ticket prints "FAST 8" — this is the marketing shorthand for "The Fate of the Furious" (2017), the 8th film in the Fast & Furious franchise. TMDB search should match either name.
- **"Presenting in" IMAX branding**: This line is a format descriptor, not movie data. It indicates the showing is in IMAX format.
- **Small stub format**: Completely different physical form factor from the 2021-22 vertical receipt and 2024 horizontal receipt. This is a small cardstock stub, not a thermal receipt. The size is comparable to CW's Coca-Cola branded cardstock tickets.
- **Rotated text orientation**: The ticket has text printed in a rotated/angled orientation. OCR must handle non-standard text directions.
- **No "SHOWCASE" watermark**: Unlike the 21-22 and 24 variants which have the "SHOWCASE CINEMA DE LUX" diagonal watermark, this 2017 stub has no watermark. The chain must be inferred from the venue name or not identified at all.
- **Faded/aged ticket**: The ticket shows significant thermal/age fading (8+ years old). Some text in the price area is partially illegible. OCR confidence will be lower.
- **Theatre 17 = IMAX screen**: This is the same Theatre 17 seen in the 2022 Batman ticket and the 2024 Deadpool ticket at Showcase Providence. It is likely the dedicated IMAX auditorium at this location — consistent across at least 7 years (2017-2024).
- **No visible seat info**: This sample does not show clear reserved seat information. IMAX showings in 2017 may have been general admission, or seat info may be in the faded/illegible area of the ticket.
- **"SE" category**: An abbreviation appearing near the price area. Unclear meaning — possibly "Standard Evening", "Special Event", or a seat section code. Not seen on later Showcase variants (which use "GAR" in 21-22 and actual type names in 24).

## Differences from Other Showcase Variants

| Feature | 17 IMAX (Stub) | 21-22 (Vertical Receipt) | 24 (Horizontal Receipt) |
|---|---|---|---|
| Form factor | Small cardstock stub | Tall vertical thermal receipt | Wide horizontal thermal receipt |
| Venue name | "Providence Place Cinema" | Not printed (watermark only) | Not printed (watermark only) |
| Chain identifier | None (venue name only) | "SHOWCASE CINEMA DE LUX" watermark | "SHOWCASE CINEMA DE LUX" watermark |
| Format in title | "FAST 8 IMAX" (appended) | Not applicable (standard only) | Not applicable |
| "MOVIE TICKET" header | No | Yes | No |
| Ticket category | "SE" (unclear) | "GAR" | Actual type ("SENIORR") |
| Seat info | Not clearly visible | "SEAT L25" (combined) | "SEAT K31" (combined) |
| Date format | M/DD/YYYY (4-digit year) | MM/DD/YYYY (4-digit year) | MM/DD/YYYY (4-digit year) |
| Scannable code | QR code | QR code | QR code |
| Orientation | Small square, rotated text | Portrait (tall/narrow) | Landscape (wide/short) |
| Payment info | Not visible | "Cred - XXXXX" | "Mobi - XXXXX" |
| Terminal info | Not visible | "428KIOSK04" | "K02" shortcode |

## Showcase Format Evolution at Providence

| Year | Variant | Form Factor | Key Feature |
|---|---|---|---|
| 2017 | IMAX Stub | Small cardstock square | "Providence Place Cinema", no watermark |
| 2021-22 | Vertical Receipt | Tall thermal receipt | "SHOWCASE CINEMA DE LUX" watermark, GAR |
| 2024 | Horizontal Receipt | Wide thermal receipt | Two-column layout, actual ticket types |

- Theatre 17 appears across all three eras (2017, 2022, 2024) — confirmed as the primary large/IMAX auditorium.
- Branding evolved: "Providence Place Cinema" (2017) → "Showcase Cinema de Lux" watermark (2021+).
- Ticket material changed: cardstock stub (2017) → thermal receipt (2021+).

## Raw Field Extraction

### showcase-17-IMAX-Fast_8.HEIC

> Note: Single ticket. Small stub with rotated text and significant aging/fading. Some fields partially illegible.

#### Ticket 1: The Fate of the Furious (IMAX)

| Field | Raw Value |
|---|---|
| Venue Name | Providence Place Cinema |
| Format Line | Presenting in (IMAX branding) |
| Movie | FAST 8 IMAX |
| MPAA Rating | PG13 |
| Day | Sat |
| Date | 4/15/2017 |
| Showtime | 11:30 AM |
| Ticket Category | SE (partially legible) |
| Ticket Price | ~$19.25 (partially legible — faded text) |
| Seat | Not clearly visible |
| Auditorium | 17 |
| QR Code | Yes |
| Transaction # | Visible along edge (partially legible) |
| Barcode | NA |

**Observations:**
- The Fate of the Furious (PG-13) released April 14, 2017. April 15, 2017 was a Saturday — opening weekend day 2. Confirmed.
- "FAST 8 IMAX" — ticket uses the marketing shorthand "Fast 8" rather than the full title "The Fate of the Furious". "IMAX" is appended as the format designation.
- "Providence Place Cinema" — the IMAX theater at Providence Place Mall. Operated by National Amusements (Showcase's parent company). This venue name does not appear on any later Showcase tickets, which use the "Showcase Cinema de Lux" watermark instead.
- 11:30 AM Saturday = matinee IMAX showing on opening weekend.
- Theatre 17 — same auditorium as the 2022 Batman ticket and 2024 Deadpool ticket at this location. This is almost certainly the dedicated IMAX screen, used consistently from 2017 through 2024.
- Price area is partially faded. Best reading suggests ~$19.25, consistent with IMAX premium pricing in 2017. Standard Showcase pricing was $11-15 in this era; IMAX upcharge of $4-5 would put it at $15-20.
- "SE" category — not seen on later Showcase variants. Could be "Standard Evening", "Special Event", or a now-retired pricing code. The 21-22 variant used "GAR" (General Admission Reserved) and the 24 variant uses descriptive types like "SENIORR".
- No seat information clearly visible. IMAX screenings in 2017 at this venue may have been general admission (no reserved seating), or the seat info is in the faded area.
- Significant paper aging — ticket is 8+ years old. The small cardstock format has held up better than thermal paper would, but ink is noticeably faded.
- "Presenting in" line is an IMAX-specific branding element — indicates the theater's IMAX partnership/certification.

## Golden JSON

```json
{
  "id": "showcase-17-IMAX-001",
  "image_path": "showcase/showcase-17-IMAX-Fast_8.HEIC",
  "source": "manual",
  "added_date": "2026-02-15",
  "notes": "Showcase/National Amusements IMAX stub from 2017. Venue printed as 'Providence Place Cinema' (not 'Showcase'). 'FAST 8 IMAX' = 'The Fate of the Furious' in IMAX. Small cardstock stub — completely different form factor from 21-22/24 thermal receipts. Theatre 17 = same IMAX screen used through 2024. Price partially illegible (~$19.25). 'SE' ticket category meaning unclear.",
  "expected": {
    "movie_title": "The Fate of the Furious",
    "theater_chain": "Showcase Cinema de Lux",
    "theater_name": "Providence Place Cinema IMAX",
    "theater_location": "Providence, RI",
    "showtime": "2017-04-15T11:30:00",
    "seat_info": null,
    "format": "IMAX",
    "auditorium": "17",
    "ticket_price": {
      "amount": 19.25,
      "currency": "USD"
    },
    "confidence_score": 0.70
  }
}
```
