# Cinemark Theatres — 2025 (Thermal Stub, Two-Part Format, Two Locations)

## Variant Overview
- **Chain**: Cinemark Theatres (Century Theatres subsidiary brand)
- **Locations analyzed**: Century at Pacific Commons (Fremont, CA) and Century 20 Great Mall (Milpitas, CA)
- **Ticket type**: Two-part thermal receipt stub — main stub (left) + abbreviated duplicate (right), likely perforated for tearing
- **Visual identifiers**: Same stylized italic "CINEMARK" logo as 2024. Two-part format is the key visual difference from the 2024 single-stub variant — the right half shows abbreviated field labels ("HS:" instead of "House:", "S#" instead of "Seat#"). Off-white thermal paper. 1D barcode on main stub only.
- **Era**: 2025
- **Website**: www.cinemark.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Two-part thermal receipt stub — the main stub (left half) contains full field labels and a barcode, while the abbreviated duplicate (right half) mirrors the same data with shortened labels and no barcode. The halves are likely connected by a perforation for tearing — the theater keeps one half, the patron keeps the other. Reading the main (left) stub top-to-bottom:

1. **CINEMARK logo** — same stylized italic graphic as the 2024 variant. Chain identifier.
2. **Location name + store code** — full location with state abbreviation and store number. Examples:
   - "Century Pac Commons Fremont CA1060" — "Century" brand + "Pac Commons" (Pacific Commons mall) + "Fremont" city + "CA" state + "1060" store code.
   - "CENTURY 20 GREAT MALL" — "Century 20" (brand + screen count) + "Great Mall" (mall name). ALL CAPS on this location.
3. **Order number** — "Order # NNNNNNN" (e.g. "Order # 7320094", "Order # 12830487"). Unique per purchase.
4. **Movie title** — mixed case, clean (no suffix). Examples: "Wicked: For Good", "F1 The Movie". Titles include subtitles and descriptors as printed.
5. **Day + Time** — "Mon 6:30PM" or "Sat 9:05AM" — abbreviated day, 12-hour time, no space before AM/PM.
6. **Date** — "MM/DD/YYYY" with 4-digit year (e.g. "12/15/2025", "7/12/2025"). No leading zero on single-digit month.
7. **MPAA rating** — "Rated: PG" or "Rated: PG-13" — with "Rated:" prefix. The hyphen in "PG-13" is printed (unlike some chains that print "PG13" without hyphen).
8. **Ticket type** — "General Admission" or "Matinee" — pricing tier name on its own line. This is separate from the price line (unlike the 2024 variant which combined them as "General Admission $15.50" on one line).
9. **Price** — "Price: $XX.XX" — with "Price:" prefix label on its own line. This is a format change from 2024 where the price was on the same line as the ticket type.
10. **House + Seat** — "House: NN  Seat# XN" (e.g. "House: 11  Seat# G2", "House: 17  Seat# D2"). Both in **large bold** font. Same format as 2024.
11. **1D Barcode** — traditional barcode. Only on the main (left) stub.
12. **Ticket ID** — "TKTNNNNNNNN" (e.g. "TKT8730428", "TKT15400324"). Below the barcode.

**Right (abbreviated) stub layout:**
- Mirrors left stub data with shortened labels:
  - "HS:" instead of "House:"
  - "S#" instead of "Seat#"
  - Store code (e.g. "440") may appear at top where location would be
- No barcode on the right stub
- Same TKT# printed below

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

### Two-Part Ticket Format
- This 2025 variant is a **two-part stub** — the main stub (left) and an abbreviated duplicate (right) are connected, likely by perforation. When photographed un-torn, OCR will see duplicate text — each field appears TWICE (once full, once abbreviated).
- Gemini must not extract duplicate values. Use the LEFT (main) stub as the source of truth — it has full field labels and a barcode.
- The abbreviated right stub uses shortened labels: "HS:" = House, "S#" = Seat#. If only the right stub is visible (left torn off), these abbreviations must be decoded.
- The 2024 variant appeared as single stubs — either the format changed in 2025, or the 2024 stubs were already torn before photographing.

### Two Different Locations
- This image contains tickets from **two different Century Theatres locations**:
  - **Century at Pacific Commons** (Fremont, CA) — store code CA1060
  - **Century 20 Great Mall** (Milpitas, CA) — store code 440
- Both are Cinemark-owned Century Theatres in the San Francisco Bay Area, about 10 miles apart.
- The location name format differs between the two:
  - Pacific Commons: "Century Pac Commons Fremont CA1060" (mixed case, city + state + code)
  - Great Mall: "CENTURY 20 GREAT MALL" (ALL CAPS, screen count in name, no city/state/code on main stub)
- **"20" in "CENTURY 20"** is the screen count (20-screen venue), NOT an auditorium number. Do not confuse with House number.

### Store Code Format
- "CA1060" on the Pacific Commons ticket — "CA" = California, "1060" = store number. The full text "Century Pac Commons Fremont CA1060" now reveals what was truncated on the 2024 ticket ("Century Pac Commons Fremon...").
- "440" on the Great Mall ticket's right stub — appears at the top where the location info would be. This is a shorter store code format. Different Cinemark locations may use different code formats.

### "Matinee" vs "General Admission" Pricing Tiers
- **"General Admission"** = standard adult pricing ($15.25 for Monday evening)
- **"Matinee"** = discounted early showing ($12.00 for Saturday 9:05 AM)
- Both are pricing tier names — both have ASSIGNED seats despite "General Admission" suggesting otherwise.
- $3.25 savings for matinee vs evening at comparable Bay Area locations.
- 2025 "General Admission" ($15.25) is $0.25 LESS than 2024 ($15.50) — likely due to day-of-week pricing (Monday vs Sunday) rather than a year-over-year decrease.

### Price and Ticket Type on Separate Lines (2025 Change)
- In the 2024 variant: "General Admission $15.50" — ticket type + price on ONE line.
- In the 2025 variant: "General Admission" and "Price: $15.25" on SEPARATE lines, with a "Price:" label prefix.
- This layout change may affect field extraction if the parser expects a combined line.

### "F1 The Movie" vs "F1"
- The ticket prints "F1 The Movie" — this may be the full marketing title or a Cinemark POS clarification to avoid ambiguity with the abbreviation "F1".
- The official theatrical title is "F1". TMDB search should match either form.
- `movie_title` in the golden JSON uses "F1" (official title), with the printed form noted.

### "Wicked: For Good" — Sequel Title
- "Wicked: For Good" is the sequel to "Wicked" (2024). The colon + subtitle is printed cleanly — no truncation.
- This is the same House 11 at Century Pacific Commons as the 2024 "Wicked" ticket — same auditorium for the same franchise, one year later.

### Saturday 9:05 AM Showtime
- The F1 ticket shows "Sat 9:05AM" — an unusually early showtime. This is a matinee-priced early bird showing, likely for a movie in its second or third weekend when demand has shifted to off-peak hours.
- F1 released June 25, 2025. July 12 is a Saturday, about 2.5 weeks into its run.

### Wicked: For Good Release Timing
- Wicked: For Good released November 21, 2025. December 15 is a Monday, about 3.5 weeks after opening. Monday evening at 6:30 PM suggests a post-work viewing well into the theatrical run.

## Differences from 2024 Variant

| Feature | 2025 (Two-Part) | 2024 (Single Stub) |
|---|---|---|
| Stub format | Two-part (main + abbreviated duplicate) | Single stub |
| Right stub labels | "HS:", "S#" (abbreviated) | N/A |
| Barcode location | Left stub only | Single stub |
| Ticket type + Price | Separate lines ("Matinee" / "Price: $12.00") | Combined ("General Admission $15.50") |
| "Price:" label | Yes | No |
| Location detail | Full with store code ("CA1060") | Truncated ("Fremon...") |
| Known pricing tiers | General Admission, Matinee | General Admission only |
| TKT# range | TKT8730428 – TKT15400324 | TKT8251241 – TKT8251242 |

## Cinemark Format Continuity

| Feature | 2024 | 2025 | Consistent? |
|---|---|---|---|
| CINEMARK logo style | Italic graphic | Italic graphic | Yes |
| "Century" subsidiary brand | Yes | Yes | Yes |
| "House:" auditorium label | Yes | Yes | Yes |
| "Seat# XN" combined format | Yes | Yes | Yes |
| "Rated: PG" with prefix | Yes | Yes | Yes |
| Day/Time format | "Sun 7:15PM" | "Mon 6:30PM" | Yes |
| Date format | MM/DD/YYYY | MM/DD/YYYY (no leading zero) | Yes |
| Clean movie titles | Yes | Yes | Yes |
| 1D barcode (no QR) | Yes | Yes | Yes |
| House 11 at Pac Commons | Wicked | Wicked: For Good | Same franchise, same screen |

## Raw Field Extraction

### cinemark-25-Wicker_For_Good+F1_The_Movie.HEIC

> Note: Two separate tickets (different movies, different locations, different dates). Each ticket is a two-part format showing main stub + abbreviated duplicate. Both un-torn.

#### Ticket 1 (Top): Wicked: For Good — Century Pacific Commons

| Field | Raw Value |
|---|---|
| Chain Logo | CINEMARK (italic/stylized graphic) |
| Location | Century Pac Commons Fremont CA1060 |
| Order # | 7320094 |
| Movie | Wicked: For Good |
| Day | Mon |
| Showtime | 6:30PM |
| Date | 12/15/2025 |
| MPAA Rating | Rated: PG |
| Ticket Type | General Admission |
| Price | $15.25 |
| House (Auditorium) | 11 |
| Seat# | G2 |
| Ticket ID | TKT8730428 |
| Barcode | 1D barcode (left stub only) |
| QR Code | NA |
| **Right Stub Abbreviations** | HS: 11  S# G2, TKT8730428 |

**Observations:**
- Wicked: For Good (PG) released November 21, 2025. December 15 is a Monday — about 3.5 weeks into theatrical run. Confirmed 2025.
- "Century Pac Commons Fremont CA1060" — now fully visible (the 2024 ticket truncated at "Fremon..."). "CA" = California, "1060" = store number. This confirms the 2024 location identification.
- House 11 — the same auditorium used for "Wicked" in 2024. Same franchise, same screen, one year apart. Likely indicates House 11 is a premium/large auditorium reserved for tentpole films at this location.
- Seat G2 — Row G (same row as 2024's G12/G13) but Seat 2 (aisle or near-aisle). The patron appears to prefer Row G at this venue.
- $15.25 General Admission — Monday evening pricing. $0.25 less than Sunday evening 2024 ($15.50). Possible day-of-week pricing differential.
- Single ticket this time (vs 2 tickets in 2024 order) — solo viewing or companion's ticket not saved.
- Two-part format clearly visible — right stub shows abbreviated "HS: 11  S# G2" and repeats TKT#.

#### Ticket 2 (Bottom): F1 The Movie — Century 20 Great Mall

| Field | Raw Value |
|---|---|
| Chain Logo | CINEMARK (italic/stylized graphic) |
| Location | CENTURY 20 GREAT MALL |
| Order # | 12830487 |
| Movie | F1 The Movie |
| Day | Sat |
| Showtime | 9:05AM |
| Date | 7/12/2025 |
| MPAA Rating | Rated: PG-13 |
| Ticket Type | Matinee |
| Price | $12.00 |
| House (Auditorium) | 17 |
| Seat# | D2 |
| Ticket ID | TKT15400324 |
| Barcode | 1D barcode (left stub only) |
| QR Code | NA |
| **Right Stub Abbreviations** | 440, HS: 17  S# D2, TKT15400324 |

**Observations:**
- F1 (PG-13) released June 25, 2025. July 12 is a Saturday — about 2.5 weeks into theatrical run. Confirmed 2025.
- "CENTURY 20 GREAT MALL" — Century 20 Great Mall in Milpitas, CA. "20" = screen count (20-screen venue). Great Mall is a large outlet mall in Milpitas. Different location from the Pacific Commons tickets.
- Location printed in ALL CAPS — unlike Pacific Commons which uses mixed case. POS formatting may differ between locations.
- "440" on the right stub top — likely the store code for Great Mall (vs "1060" for Pacific Commons). Shorter format.
- "Matinee" pricing tier — $12.00 vs $15.25 General Admission. $3.25 savings for the 9:05 AM Saturday showing.
- 9:05 AM is an exceptionally early showtime — early-bird matinee, common for films past their opening weekends.
- House 17 — one of 20 screens at this location. The screen numbering is higher than Pacific Commons (which goes up to at least 11 of ~16).
- Seat D2 — Row D, Seat 2. Closer to the front and near the aisle. Different seating preference from the Row G selections at Pacific Commons.
- TKT15400324 — notably higher than TKT8730428 (Wicked ticket from December), suggesting the TKT numbering is not strictly chronological across locations or has been reset/restarted.
- "F1 The Movie" — full printed title. The official theatrical release title is "F1". The "The Movie" descriptor may be a Cinemark POS addition for clarity.
- "Rated: PG-13" — includes hyphen in rating. This is different from chains like Showcase that print "PG13" (no hyphen).

## Cross-Location Comparison (Bay Area Century Theatres)

| Feature | Century Pac Commons (Fremont) | Century 20 Great Mall (Milpitas) |
|---|---|---|
| Store code | CA1060 | 440 |
| Screen count | ~16 | 20 |
| Location name case | Mixed case | ALL CAPS |
| Evening pricing | $15.25 (General Admission) | — |
| Matinee pricing | — | $12.00 |
| City/state in location | Yes ("Fremont CA") | No |

## Golden JSON

```json
[
  {
    "id": "cinemark-25-001",
    "image_path": "cinemark/cinemark-25-Wicker_For_Good+F1_The_Movie.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Cinemark/Century two-part stub. 'Century Pac Commons Fremont CA1060' — full location now visible (was truncated in 2024 ticket). Same House 11 as 2024 Wicked ticket — same auditorium for the sequel. Row G again (patron preference). General Admission $15.25 Mon evening. Right stub abbreviates 'HS:' and 'S#'.",
    "expected": {
      "movie_title": "Wicked: For Good",
      "theater_chain": "Cinemark",
      "theater_name": "Century at Pacific Commons",
      "theater_location": "Fremont, CA",
      "showtime": "2025-12-15T18:30:00",
      "seat_info": {
        "row": "G",
        "seat": "2"
      },
      "format": "Standard",
      "auditorium": "11",
      "ticket_price": {
        "amount": 15.25,
        "currency": "USD"
      },
      "confidence_score": 0.93
    }
  },
  {
    "id": "cinemark-25-002",
    "image_path": "cinemark/cinemark-25-Wicker_For_Good+F1_The_Movie.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Cinemark/Century two-part stub from a DIFFERENT location (Century 20 Great Mall, Milpitas). 'F1 The Movie' printed title — official title is 'F1'. Matinee pricing tier ($12.00) for 9:05 AM Saturday showing. Store code '440'. ALL CAPS location name — different POS formatting from Pacific Commons. 'Rated: PG-13' includes hyphen.",
    "expected": {
      "movie_title": "F1",
      "theater_chain": "Cinemark",
      "theater_name": "Century 20 Great Mall",
      "theater_location": "Milpitas, CA",
      "showtime": "2025-07-12T09:05:00",
      "seat_info": {
        "row": "D",
        "seat": "2"
      },
      "format": "Standard",
      "auditorium": "17",
      "ticket_price": {
        "amount": 12.00,
        "currency": "USD"
      },
      "confidence_score": 0.93
    }
  }
]
```
