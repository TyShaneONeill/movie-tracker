# Cinemark Theatres — 2024 (Thermal Stub, Century Subsidiary)

## Variant Overview
- **Chain**: Cinemark Theatres (Century Theatres subsidiary brand)
- **Location analyzed**: Century at Pacific Commons, Fremont, CA
- **Ticket type**: Small thermal receipt stub — roughly square, compact format
- **Visual identifiers**: Stylized italic "CINEMARK" logo at top with mixed-case lettering (the "C" is upright, "INEMARK" is italic/slanted with underline). Off-white thermal paper. 1D barcode at bottom. Compact layout — fewer fields than AMC/Showcase receipts. No watermark pattern. Coin (quarter) placed for scale in photo suggests stubs are approximately 2.5" x 2.5".
- **Era**: 2024
- **Website**: www.cinemark.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Compact thermal receipt stub — significantly smaller than AMC or Showcase full-length thermal receipts. Single-column layout, tightly packed. Reading top-to-bottom:

1. **CINEMARK logo** — stylized italic text logo. Mixed case: "C" is upright serif, "INEMARK" is italic with an underline stroke. This is the chain identifier. Printed as a graphic/stamp, not plain text.
2. **Location name** — "Century Pac Commons Fremon..." — truncated at the stub edge. "Century" is the subsidiary brand name (Century Theatres, owned by Cinemark). "Pac Commons" = Pacific Commons (shopping center). "Fremon..." = Fremont, CA (truncated). The location line starts with the subsidiary brand, NOT "Cinemark".
3. **Order number** — "Order # NNNNNNN" (e.g. "Order # 6915905"). Shared across all tickets in the same purchase.
4. **Movie title** — "Wicked" — mixed case, NOT all-caps. No format suffix (no "AD CC", no "-CCDV"). Clean title as-is. This is notably different from AMC (which appends "AD CC") and Showcase 2017 (which appends "-CCDV" or "IMAX").
5. **Day + Time** — "Sun 7:15PM" — abbreviated day of week, time in 12-hour format with no space before AM/PM, no leading zero on hour. Day and time on the same line.
6. **Date** — "MM/DD/YYYY" (e.g. "11/24/2024") — full 4-digit year on a separate line below day+time.
7. **MPAA rating** — "Rated: PG" — with "Rated:" prefix label. Other chains print just the rating code (e.g. "PG13"); Cinemark includes the word "Rated:" before it. Some thermal fading/ghosting visible on this field.
8. **Ticket type + Price** — "General Admission $15.50" — ticket category followed by dollar amount on the same line. "General Admission" is the pricing tier name, NOT an indicator of unreserved seating (these tickets DO have assigned seats).
9. **House + Seat** — "House: NN  Seat# XNN" (e.g. "House: 11  Seat# G12"). Two fields on the same line, both in **large bold** font for easy readability. "House" = auditorium (Cinemark's terminology, vs "Theatre" at Showcase or just a number at AMC). "Seat#" combines row letter + seat number (G12 = Row G, Seat 12). The row letter is embedded in the seat code, not a separate field.
10. **Ticket ID** — "TKTNNNNNNNN" (e.g. "TKT8251241"). A unique per-ticket identifier prefixed with "TKT". Sequential across tickets in the same order (TKT8251241, TKT8251242 for adjacent seats).
11. **1D Barcode** — traditional barcode at the bottom. No QR code.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

### "Century" Subsidiary Brand
- The location reads "Century Pac Commons Fremon..." — "Century" is a subsidiary brand of Cinemark Theatres. Century Theatres was acquired by Cinemark in 2006. Many West Coast locations still use the "Century" branding.
- **`theater_chain`** should be "Cinemark" (the parent company), NOT "Century".
- **`theater_name`** should reflect what's printed: "Century at Pacific Commons" (with the truncated portion reconstructed).
- Gemini must recognize that "CINEMARK" logo + "Century..." location = Cinemark chain.

### Location Name Truncation
- "Century Pac Commons Fremon..." is physically truncated at the stub edge. Full location: "Century at Pacific Commons" in Fremont, CA.
- "Pac" = abbreviation of "Pacific" (POS abbreviation, not physical truncation).
- "Fremon..." = "Fremont" (physically truncated — the "t" and likely ", CA" are cut off).
- This is a combination of POS abbreviation AND physical edge truncation — two different truncation mechanisms on the same line.

### "House" Terminology
- Cinemark uses "House" for the auditorium/screen number. Other chains use "Theatre #" (Showcase, CW), "Auditorium" (none seen yet), or just a number in a box (AMC).
- "House: 11" = Auditorium 11. Map to `auditorium: "11"`.

### "Seat#" Combined Format
- "Seat# G12" combines the row letter and seat number into a single field. G = Row, 12 = Seat.
- This is similar to AMC's seat box ("G2" = Row G Seat 2) but with an explicit "Seat#" label.
- Parse as `seat_info: { row: "G", seat: "12" }`.
- The row letter is always the first character(s) before the numeric portion.

### "General Admission" Misnomer
- Despite reading "General Admission", these tickets HAVE assigned seats (G12, G13). The term "General Admission" here refers to the **pricing tier**, not the seating policy.
- This is potentially confusing — at other chains, "GA" or "General Admission" typically means no reserved seat. At Cinemark, it's just the standard adult ticket type.
- Do NOT set `seat_info` to null based on "General Admission" — always check for a "Seat#" field.

### Clean Movie Titles
- "Wicked" is printed as-is — no "AD CC" suffix (AMC), no "-CCDV" (Showcase 2017), no format name appended. Cinemark prints clean titles.
- This simplifies extraction — the title field can be taken literally without stripping suffixes.
- The title is in mixed case ("Wicked"), not ALL CAPS. Some chains print all-caps titles (AMC, Showcase 2017).

### Order # vs TKT#
- **Order #** (6915905) is the purchase/transaction identifier — shared across all tickets in the same order.
- **TKT#** (TKT8251241) is the individual ticket identifier — unique per ticket, sequential within an order.
- These are two different numbers. Do not confuse them. The TKT# is more useful for identifying individual tickets.

### Thermal Fading/Ghosting
- The "Rated: PG" line on the left ticket shows double-printing or ghosting — a thermal printing artifact where the text appears twice with slight offset. This can confuse OCR.
- The "General Admission $15.50" line on the right ticket also shows fading/double-print artifacts.
- These are 2024 tickets but already show thermal degradation, suggesting the paper quality is lower than AMC's thermal receipts.

### No Chain Name in Text
- "CINEMARK" appears only as a graphic logo — it is NOT printed as plain text. OCR must recognize the stylized logo to identify the chain. If the logo is unreadable, the chain can only be inferred from "Century" (subsidiary) or the overall layout.
- This is similar to AMC where the chain name is only in the watermark, not in text fields.

## Differences from Other Chains

| Feature | Cinemark 2024 | AMC 24-25 | Showcase 21-22 | CW 20-24 |
|---|---|---|---|---|
| Stub size | Small square | Long receipt | Tall receipt | Two-part cardstock |
| Chain identifier | Graphic logo | Watermark | Watermark | Coca-Cola branding |
| Auditorium label | "House" | Number in box | "THEATRE #" | None (no field) |
| Seat format | "Seat# G12" (combined) | "G2" in box (combined) | "SEAT L25" (combined) | "Row-N, Seat-6" (separate) |
| Title style | Mixed case, clean | ALL CAPS + "AD CC" | ALL CAPS (varies) | ALL CAPS |
| Rating format | "Rated: PG" (with label) | "PG" (standalone) | Not always printed | Not printed |
| Date format | MM/DD/YYYY | MM/DD/YYYY | MM/DD/YYYY | MM/DD/YYYY |
| Scannable code | 1D barcode | QR code | QR code | None |
| Ticket ID | TKT# (unique per ticket) | Transaction # (3x) | None visible | None |
| Order tracking | Order # (shared) | None visible | None visible | Transaction # (date-encoded) |

## Raw Field Extraction

### cinemark-24-Wicked.HEIC

> Note: Two tickets side by side, same order, adjacent seats. Coin (quarter) for scale in upper-left. Both tickets have identical data except Seat# and TKT#.

#### Ticket 1 (Left): Wicked — Seat G12

| Field | Raw Value |
|---|---|
| Chain Logo | CINEMARK (italic/stylized graphic) |
| Location | Century Pac Commons Fremon... (truncated) |
| Order # | 6915905 |
| Movie | Wicked |
| Day | Sun |
| Showtime | 7:15PM |
| Date | 11/24/2024 |
| MPAA Rating | Rated: PG (slight ghosting/double-print) |
| Ticket Type | General Admission |
| Ticket Price | $15.50 |
| House (Auditorium) | 11 |
| Seat# | G12 |
| Ticket ID | TKT8251241 |
| Barcode | 1D barcode (yes) |
| QR Code | NA |

#### Ticket 2 (Right): Wicked — Seat G13

| Field | Raw Value |
|---|---|
| Chain Logo | CINEMARK (italic/stylized graphic) |
| Location | Century Pac Commons Fremon... (truncated) |
| Order # | 6915905 |
| Movie | Wicked |
| Day | Sun |
| Showtime | 7:15PM |
| Date | 11/24/2024 |
| MPAA Rating | Rated: PG |
| Ticket Type | General Admission |
| Ticket Price | $15.50 |
| House (Auditorium) | 11 |
| Seat# | G13 |
| Ticket ID | TKT8251242 |
| Barcode | 1D barcode (yes) |
| QR Code | NA |

**Observations:**
- Wicked (PG) released November 22, 2024 (Friday). November 24, 2024 was a Sunday — opening weekend day 3. Confirmed 2024.
- "Century at Pacific Commons" — a Cinemark-owned Century Theatres location at Pacific Commons Shopping Center, Fremont, CA. The venue has 16 screens and includes an XD (Cinemark's premium large format) auditorium. Full name: "Century at Pacific Commons 16 and XD".
- Order # 6915905 is shared across both tickets — confirming group purchase (2 people, adjacent seats).
- TKT8251241 and TKT8251242 — sequential ticket IDs, one per seat. The numbering suggests a high-volume system (8.2M+ tickets in this ID range).
- G12 and G13 — adjacent seats in Row G. Standard center-ish seating for a 16-screen venue.
- House 11 — one of 16 screens. Not an XD showing (XD would likely be labeled differently or use a different pricing tier).
- $15.50 per ticket — standard Sunday evening pricing for Cinemark in the San Francisco Bay Area in 2024. Slightly higher than national average (~$12-14) due to Bay Area cost of living.
- "General Admission $15.50" — despite the "General Admission" label, seats ARE assigned (G12, G13). This is a Cinemark naming convention for the standard adult tier.
- The left ticket shows thermal ghosting on the "Rated: PG" line — text appears faintly double-printed. Both tickets are from the same 2024 printing but the left shows more degradation.
- No format indicator (not XD, not IMAX, not 3D) — this is a standard digital projection showing.
- 7:15 PM Sunday evening — a popular showtime for opening weekend. The Day/Time line ("Sun 7:15PM") puts day of week and time together, with the date on a separate line below.

## Golden JSON

```json
[
  {
    "id": "cinemark-24-001",
    "image_path": "cinemark/cinemark-24-Wicked.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Cinemark/Century Theatres stub. 'Century Pac Commons Fremon...' = Century at Pacific Commons, Fremont, CA. 'General Admission' is pricing tier (seats ARE assigned). House 11 = standard screen (not XD). Clean title — no suffix to strip. Order # 6915905 shared with ticket 2 (G13). TKT8251241 = unique ticket ID.",
    "expected": {
      "movie_title": "Wicked",
      "theater_chain": "Cinemark",
      "theater_name": "Century at Pacific Commons",
      "theater_location": "Fremont, CA",
      "showtime": "2024-11-24T19:15:00",
      "seat_info": {
        "row": "G",
        "seat": "12"
      },
      "format": "Standard",
      "auditorium": "11",
      "ticket_price": {
        "amount": 15.50,
        "currency": "USD"
      },
      "confidence_score": 0.92
    }
  },
  {
    "id": "cinemark-24-002",
    "image_path": "cinemark/cinemark-24-Wicked.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Second ticket from same order (#6915905). Adjacent seat to cinemark-24-001. TKT8251242 = sequential ticket ID. Identical data except seat (G13 vs G12).",
    "expected": {
      "movie_title": "Wicked",
      "theater_chain": "Cinemark",
      "theater_name": "Century at Pacific Commons",
      "theater_location": "Fremont, CA",
      "showtime": "2024-11-24T19:15:00",
      "seat_info": {
        "row": "G",
        "seat": "13"
      },
      "format": "Standard",
      "auditorium": "11",
      "ticket_price": {
        "amount": 15.50,
        "currency": "USD"
      },
      "confidence_score": 0.92
    }
  }
]
```
