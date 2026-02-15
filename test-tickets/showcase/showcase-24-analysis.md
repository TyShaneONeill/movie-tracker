# Showcase Cinema de Lux — 2024 (Horizontal Two-Column Receipt)

## Variant Overview
- **Chain**: Showcase Cinema de Lux (National Amusements subsidiary)
- **Location analyzed**: Showcase Cinema de Lux Providence (Providence, RI)
- **Ticket type**: Physical thermal receipt, landscape/horizontal format
- **Visual identifiers**: Same "SHOWCASE CINEMA DE LUX" diagonal watermark as 21-22 variant, but layout changed from vertical single-column to horizontal two-column. Wider than tall.
- **Era**: 2024 (current design)
- **Website**: www.showcasecinemas.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Wide horizontal/landscape thermal receipt — a significant layout change from the 2021-22 vertical format. Same "SHOWCASE CINEMA DE LUX" diagonal watermark. Content is split into two columns:

**Left column (top to bottom):**
1. **Theatre number** — "Theatre N" in large font (e.g. "Theatre 17").
2. **Seat** — "SEAT" + combined row letter + seat number (e.g. "SEAT K31" = Row K, Seat 31). Same format as 21-22 variant.
3. **Price** — dollar amount with "$" (e.g. "$16.75").
4. **Ticket type** — pricing category (e.g. "SENIORR"). Note: may contain system typos — see edge cases.
5. **Ticket number** — "Ticket: XXXXXXXX/NNN" (e.g. "Ticket: 002440179/004").
6. **Date + Time of sale** — "MM/DD/YYYY HH:MM pm" (e.g. "07/27/2024 01:26 pm").
7. **Terminal shortcode** — abbreviated terminal ID (e.g. "K02" = Kiosk 02).

**Right column (top to bottom):**
8. **Movie title** — full title (e.g. "Deadpool 3"). May use colloquial/shorthand names instead of official titles.
9. **MPAA rating** — standalone (e.g. "R").
10. **Day + Showtime** — "Day HH:MM pm" (e.g. "Sat 01:30 pm").
11. **Date** — "MM/DD/YYYY" (e.g. "07/27/2024"). Full 4-digit year.
12. **Location** — theater location name (e.g. "Providence"). May be partially cut off at ticket edge.
13. **Payment info** — "Type - XXXXX - StoreTerminal" (e.g. "Mobi - 32759 - 428KIOS"). Payment type + partial card/device ID + terminal.
14. **QR code** — bottom right.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **"SENIORR" double R**: Appears to be a system typo — "SENIOR" with an extra "R". Could also be "SENIOR" + "R" rating concatenated. Since the R rating appears separately on the right column, most likely a typo. Extract ticket_type as "Senior".
- **Colloquial movie titles**: "Deadpool 3" is printed on the ticket, but the official title is "Deadpool & Wolverine". Gemini should use the PRINTED title for extraction but TMDB matching should search for both the printed name and likely official titles.
- **"Mobi" vs "Cred"**: The 21-22 variant used "Cred" (credit card). The 2024 variant uses "Mobi" — likely mobile payment (Apple Pay, Google Pay, etc.). Both are payment method indicators, NOT ticket data.
- **Terminal code truncated**: "428KIOS" is cut off at the ticket edge — full code is likely "428KIOSK02" (matching the "K02" shortcode on the left column). Store 428 = Providence location.
- **No "GAR" category**: The 21-22 variant had "GAR" (General Admission Reserved). The 2024 variant shows the actual ticket type instead (e.g. "SENIORR"). This may mean the "GAR" code was replaced or only appears for standard adult pricing.
- **No "MOVIE TICKET" header**: Unlike the 21-22 vertical format, this layout does not have the "MOVIE TICKET" bold header at the top.
- **Landscape vs portrait**: The 2024 layout is HORIZONTAL (wider than tall), while 2021-22 was VERTICAL (taller than wide). Same chain, same watermark, completely different layout.
- **Very late purchase**: Time of sale (01:26 pm) is only 4 minutes before showtime (01:30 pm). The time of sale is still NOT the showtime.

## Differences from 21-22 Variant

| Feature | 21-22 Variant (Vertical) | 24 Variant (Horizontal) |
|---|---|---|
| Orientation | Portrait (tall/narrow) | Landscape (wide/short) |
| Layout | Single column, top-to-bottom | Two columns, left + right |
| "MOVIE TICKET" header | Yes | No |
| "GAR" category | Yes (on every ticket) | No (replaced by actual type) |
| Ticket type | "GAR" | "SENIORR", likely "ADULT", etc. |
| Payment label | "Cred" (credit card) | "Mobi" (mobile payment) |
| Movie info position | Top of single column | Right column |
| Theatre/Seat position | Middle of single column | Left column (top) |
| Transaction info position | Bottom of single column | Left column (bottom) |

## Raw Field Extraction

### showcase-24-analysis.HEIC

> Note: Single ticket, landscape format.

**Left column, top to bottom:**

| Field | Raw Value |
|---|---|
| Theatre (Auditorium) | 17 |
| Seat | K31 (Row K, Seat 31) |
| Price | $16.75 |
| Ticket Type | SENIORR |
| Ticket # | 002440179/004 |
| Date of Sale | 07/27/2024 |
| Time of Sale | 01:26 pm |
| Terminal Short | K02 |

**Right column, top to bottom:**

| Field | Raw Value |
|---|---|
| Movie | Deadpool 3 |
| MPAA Rating | R |
| Day | Sat |
| Showtime | 01:30 pm |
| Date | 07/27/2024 |
| Location | Providence (partially cut off: "Providen...") |
| Payment | Mobi - 32759 - 428KIOS (cut off) |
| QR Code | Yes (visible) |

**Observations:**
- "Deadpool 3" is the colloquial name — official title is "Deadpool & Wolverine" (released July 26, 2024). Date 07/27/2024 (Saturday) is opening weekend. Confirmed.
- "SENIORR" — almost certainly a system typo for "SENIOR". The extra R is not the rating (R appears separately on the right side).
- $16.75 senior pricing — higher than the 2022 standard price of $15.25. Prices went up but this is discounted (senior vs adult).
- Ticket #004 — fourth ticket in a group purchase. At least 4 tickets bought together.
- "Mobi - 32759" — mobile payment. The "32759" matches closely with the "32751" card number from the 2022 Batman ticket — possibly the same person's payment method across years.
- "428KIOS" — same Providence store code (428) as the 2022 ticket. Terminal cut off but "K02" shortcode confirms Kiosk 02.
- Same Theatre 17 as the 2022 Batman ticket — possibly a preferred/large auditorium at this location.
- Time of sale 01:26 pm vs showtime 01:30 pm — 4-minute gap. Extremely last-minute kiosk purchase.
- Paper is noticeably crumpled but all text remains legible.

## Golden JSON

```json
{
  "id": "showcase-24-001",
  "image_path": "showcase/showcase-24-analysis.HEIC",
  "source": "manual",
  "added_date": "2026-02-15",
  "notes": "Showcase 2024 horizontal layout variant. 'Deadpool 3' printed but official title is 'Deadpool & Wolverine'. 'SENIORR' is likely typo for 'SENIOR'. Same Providence location (store 428) as 21-22 Batman ticket. Mobile payment (Mobi) instead of credit card (Cred). Ticket #004 in group of 4+.",
  "expected": {
    "movie_title": "Deadpool & Wolverine",
    "theater_chain": "Showcase Cinema de Lux",
    "theater_name": "Showcase Cinema de Lux Providence",
    "theater_location": "Providence, RI",
    "showtime": "2024-07-27T13:30:00",
    "seat_info": {
      "row": "K",
      "seat": "31"
    },
    "format": "Standard",
    "auditorium": "17",
    "ticket_price": {
      "amount": 16.75,
      "currency": "USD"
    },
    "confidence_score": 0.90
  }
}
```
