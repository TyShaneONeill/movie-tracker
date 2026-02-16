# AMC Theatres — 2024-2025 (Thermal Receipt, Standard Format)

## Variant Overview
- **Chain**: AMC Theatres
- **Locations analyzed**: AMC Assembly Row 12 (Somerville, MA), AMC Boston Common 19 (Boston, MA)
- **Ticket type**: Physical thermal receipt
- **Visual identifiers**: White paper with repeating "amc" and "amazing" watermark pattern featuring small icons (popcorn, rockets, planets, stars) in light gray. Large bold auditorium number on the right side. Seat code in a highlighted/colored box on the left. QR code between seat and auditorium number.
- **Era**: 2024-2025 (current design)
- **Website**: www.amctheatres.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Standard-width thermal receipt with repeating "amc amazing" watermark pattern (small icons: popcorn bucket, rocket, planet, stars). Layout is single-column, top-to-bottom:

1. **Location name + store ID** — theater location with store/unit number (e.g. "Assembly Row #0504", "Boston Comm Unit2657"). The chain name "AMC" is NOT printed in this field — only the location identifier.
2. **Movie title line** — ALL CAPS. Includes the movie title, optional format designation (e.g. "DOLBY" for Dolby Cinema), and accessibility codes "AD CC" (Audio Description + Closed Captioning). Long titles are **truncated** to make room for format + accessibility codes. Examples:
   - Standard: "WONKA AD CC", "CIVIL WAR AD CC"
   - Premium format: "LILO & DOLBY AD CC" (Dolby Cinema showing of "Lilo & Stitch")
   - Truncated: "IT ENDS WITH AD CC" (missing "Us" from "It Ends with Us")
3. **Showtime + Day + Date** — single line: "H:MMpm Day MM/DD/YYYY" (e.g. "6:45pm Mon 01/15/2024"). 12-hour format with am/pm, abbreviated day, **full 4-digit year**.
4. **Ticket type + Base price** — "ADULT* $XX.XX". The asterisk likely indicates an AMC Stubs member pricing tier.
5. **Savings** — "Savings $X.XX" — discounts applied (e.g. AMC Stubs Discount Tuesdays). Shows "$0.00" when no discount.
6. **Tax** — "Tax $0.00" (typically zero for movie tickets).
7. **Total** — "Total $XX.XX" — final price paid after savings.
8. **Seat code** — in a highlighted/colored box: row letter + seat number combined (e.g. "L7" = Row L, Seat 7; "H9" = Row H, Seat 9; "Q14" = Row Q, Seat 14). Red or dark background with white text.
9. **MPAA rating** — standalone next to the seat box (e.g. "PG", "R", "PG13").
10. **QR code** — between seat and auditorium number.
11. **Auditorium number** — large bold digit on the right (e.g. "5", "7", "14", "9").
12. **Transaction number** — long numeric string at the bottom (e.g. "70149614113700007").
13. **Date + Time of sale** — "M/DD/YYYY H:MM:SS PM" (e.g. "1/15/2024 6:40:13 PM"). This is the PURCHASE timestamp, not the showtime. Note: uses single-digit month (no leading zero).

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **"AD CC" suffix on every title**: AMC appends "AD CC" (Audio Description + Closed Captioning) accessibility codes to every movie title. These are NOT part of the movie name. Strip "AD CC" from the end of the title before extraction.
- **Format embedded in title**: For premium format showings (Dolby Cinema, IMAX, etc.), the format name is inserted between the movie title and "AD CC". Pattern: `{TITLE} {FORMAT} AD CC`. For standard showings, it's just `{TITLE} AD CC`. The format takes priority — if the title + format + "AD CC" exceed the character limit, the title gets truncated first.
  - "LILO & DOLBY AD CC" = "Lilo & Stitch" in Dolby Cinema (title truncated to "LILO &", "STITCH" dropped to fit "DOLBY")
  - "WONKA AD CC" = "Wonka" in standard format (no format prefix needed)
- **Title truncation**: The title field has a ~18 character limit (including format + "AD CC"). Short titles fit completely. Long titles lose words from the end:
  - "IT ENDS WITH AD CC" = "It Ends with Us" (drops "Us")
  - "LILO & DOLBY AD CC" = "Lilo & Stitch" in Dolby (drops "Stitch" to fit "DOLBY")
- **"ADULT*" asterisk**: The asterisk likely denotes AMC Stubs member pricing. All tickets in this sample show "ADULT*" regardless of discount status.
- **Savings line = discounts**: The "Savings" field shows applied discounts. "$7.99" savings on a Tuesday showing = AMC Stubs "Discount Tuesdays" promotion. "$0.00" = no discount applied.
- **Price varies by location and format**:
  - Assembly Row (Somerville): $14.99 standard
  - Boston Common (Boston): $15.49 standard, $22.99 Dolby Cinema
  - Downtown locations charge more than suburban locations.
- **No chain name in location field**: "Assembly Row #0504" and "Boston Comm Unit2657" do NOT include "AMC" — the chain is identified only by the watermark pattern. Gemini must recognize AMC from the "amc amazing" watermark or general context.
- **Location name truncation**: "Boston Common" is truncated to "Boston Comm" to fit. "Unit2657" is the store/unit number.
- **Seat code format**: Combined row letter + seat number in a highlighted box (e.g. "L7", "H9", "Q14"). No separator between row and number. Same parsing challenge as Showcase's "SEAT L25" — letter(s) = row, trailing digit(s) = seat.
- **Time of sale vs showtime**: Two timestamps appear. The showtime is in the movie info section near the top. The time of sale is at the very bottom. Extract the SHOWTIME, not the sale time.
- **Group purchases**: Multiple tickets for the same showing have sequential transaction numbers and purchase timestamps 1 second apart. Each ticket has a different seat.
- **Full 4-digit year**: Date uses MM/DD/YYYY format (e.g. "01/15/2024"). No year inference needed.
- **Dolby Cinema pricing premium**: $22.99 vs $14.99-$15.49 standard — roughly $8 premium for Dolby Cinema format.

## Raw Field Extraction

### amc-24-25-5_Movies.HEIC

> Note: This single image contains FIVE tickets from two AMC locations.

#### Ticket 1: Wonka (top left)

| Field | Raw Value |
|---|---|
| Location | Assembly Row #0504 |
| Movie | WONKA AD CC |
| Showtime | 6:45pm |
| Day | Mon |
| Date | 01/15/2024 |
| Ticket Type | ADULT* |
| Base Price | $14.99 |
| Savings | $0.00 |
| Tax | $0.00 |
| Total | $14.99 |
| Seat | L7 (Row L, Seat 7) |
| MPAA Rating | PG |
| Auditorium | 5 |
| QR Code | Yes |
| Transaction # | 70149614113700007 |
| Date/Time of Sale | 1/15/2024 6:40:13 PM |

**Observations:**
- Wonka (PG) released December 15, 2023. January 15, 2024 was a Monday — Martin Luther King Jr. Day (federal holiday). About 1 month after release, confirmed in theaters.
- "Assembly Row #0504" = AMC Assembly Row 12, Somerville, MA. "#0504" is the store number.
- "WONKA AD CC" — title fits completely, no truncation needed. "AD CC" = Audio Description + Closed Captioning.
- $14.99 standard adult pricing at suburban Somerville location.
- Time of sale 6:40 PM, showtime 6:45 PM — bought 5 minutes before showtime.
- Row L, Seat 7 in Auditorium 5.

---

#### Ticket 2: Civil War (top center)

| Field | Raw Value |
|---|---|
| Location | Assembly Row #0504 |
| Movie | CIVIL WAR AD CC |
| Showtime | 6:15pm |
| Day | Tue |
| Date | 04/23/2024 |
| Ticket Type | ADULT* |
| Base Price | $14.99 |
| Savings | $7.99 |
| Tax | $0.00 |
| Total | $7.00 |
| Seat | L3 (Row L, Seat 3) |
| MPAA Rating | R |
| Auditorium | 7 |
| QR Code | Yes |
| Transaction # | 70039141130025 |
| Date/Time of Sale | 4/23/2024 6:15:41 PM |

**Observations:**
- Civil War (R) — the A24 film directed by Alex Garland — released April 12, 2024. April 23, 2024 (Tuesday) is second week. Confirmed.
- **"Discount Tuesday" pricing**: Base $14.99 - Savings $7.99 = **$7.00 total**. AMC Stubs "Discount Tuesdays" gives members significant savings (~53% off). This is the standout pricing edge case in this batch.
- Same Assembly Row #0504 location as Wonka.
- Time of sale 6:15:41 PM matches showtime 6:15pm exactly — ticket was printed/picked up right at showtime.
- Row L, Seat 3 — same row L as the Wonka ticket. Possible patron preference for Row L at this location.

---

#### Ticket 3: Lilo & Stitch — Dolby Cinema (top right)

| Field | Raw Value |
|---|---|
| Location | Boston Comm Unit2657 |
| Movie | LILO & DOLBY AD CC |
| Showtime | 4:00pm |
| Day | Sun |
| Date | 05/25/2025 |
| Ticket Type | ADULT* |
| Base Price | $22.99 |
| Savings | $0.00 |
| Tax | $0.00 |
| Total | $22.99 |
| Seat | H9 (Row H, Seat 9) |
| MPAA Rating | PG |
| Auditorium | 14 |
| QR Code | Yes |
| Transaction # | 60488914084000003 |
| Date/Time of Sale | 5/25/2025 3:48:13 PM |

**Observations:**
- Lilo & Stitch (PG) — 2025 live-action remake — released May 23, 2025. May 25, 2025 (Sunday) is opening weekend. Confirmed.
- **Title truncation with format**: "LILO & DOLBY AD CC" — "Stitch" dropped to fit "DOLBY" (Dolby Cinema format designation) + "AD CC". The format name takes priority over the full movie title.
- "Boston Comm Unit2657" = AMC Boston Common 19, Boston, MA. "Comm" = "Common" truncated. "Unit2657" is the store number.
- $22.99 Dolby Cinema pricing — $8 premium over standard ($14.99 at Assembly Row). Downtown Boston premium on top of that.
- Time of sale 3:48 PM, showtime 4:00 PM — 12 minutes before.
- Transaction ends in "0003" — ticket 3 in a group purchase (see Ticket 4).

---

#### Ticket 4: Lilo & Stitch — Dolby Cinema (bottom left)

| Field | Raw Value |
|---|---|
| Location | Boston Comm Unit2657 |
| Movie | LILO & DOLBY AD CC |
| Showtime | 4:00pm |
| Day | Sun |
| Date | 05/25/2025 |
| Ticket Type | ADULT* |
| Base Price | $22.99 |
| Savings | $0.00 |
| Tax | $0.00 |
| Total | $22.99 |
| Seat | H10 (Row H, Seat 10) |
| MPAA Rating | PG |
| Auditorium | 14 |
| QR Code | Yes |
| Transaction # | 60488914084000002 |
| Date/Time of Sale | 5/25/2025 3:48:12 PM |

**Observations:**
- **Same showing as Ticket 3** — same movie, date, time, auditorium. Different seat (H10 vs H9). This is a group purchase of at least 3 tickets (transaction numbers end in 0002 and 0003).
- Adjacent seats: H9 and H10 in Auditorium 14. Bought together.
- Time of sale 3:48:12 PM — exactly 1 second before Ticket 3 (3:48:13 PM). Confirms same transaction, tickets printed sequentially.
- Transaction number differs only in the last digit: "...0002" vs "...0003". Sequential ticket numbering within the purchase.

---

#### Ticket 5: It Ends with Us (bottom right)

| Field | Raw Value |
|---|---|
| Location | Boston Comm Unit2657 |
| Movie | IT ENDS WITH AD CC |
| Showtime | 6:45pm |
| Day | Sun |
| Date | 08/18/2024 |
| Ticket Type | ADULT* |
| Base Price | $15.49 |
| Savings | $0.00 |
| Tax | $0.00 |
| Total | $15.49 |
| Seat | Q14 (Row Q, Seat 14) |
| MPAA Rating | PG13 |
| Auditorium | 9 |
| QR Code | Yes |
| Transaction # | 70108116012080006 |
| Date/Time of Sale | 8/18/2024 6:11:44 PM |

**Observations:**
- It Ends with Us (PG-13) released August 9, 2024. August 18, 2024 (Sunday) is second weekend. Confirmed.
- **Title truncated**: "IT ENDS WITH AD CC" — "Us" dropped from "It Ends with Us" to fit "AD CC" within the character limit. Only one word lost.
- Boston Common standard pricing: $15.49 — $0.50 more than Assembly Row's $14.99. Downtown premium.
- Time of sale 6:11 PM, showtime 6:45 PM — bought 34 minutes before showtime (most advance purchase in this batch).
- Row Q, Seat 14 — further back than the H-row seats for Lilo & Stitch. Different auditorium (9 vs 14).

## Price Analysis

| Location | Format | Day | Base Price | Savings | Total |
|---|---|---|---|---|---|
| Assembly Row | Standard | Monday | $14.99 | $0.00 | $14.99 |
| Assembly Row | Standard | Tuesday | $14.99 | $7.99 | $7.00 |
| Boston Common | Standard | Sunday | $15.49 | $0.00 | $15.49 |
| Boston Common | Dolby Cinema | Sunday | $22.99 | $0.00 | $22.99 |

- **Suburban vs Downtown**: Assembly Row (Somerville) is ~$0.50 cheaper than Boston Common (downtown Boston).
- **Dolby Cinema premium**: +$7.50 over Boston Common standard pricing.
- **Discount Tuesday**: AMC Stubs members save ~$8 on Tuesdays (53% off).
- **ADULT* on all tickets**: Asterisk present regardless of discount status.

## AMC Title Encoding Pattern

The title field follows this pattern: `{MOVIE_TITLE} [{FORMAT}] AD CC`

| Full Movie Title | Printed Title | Truncated? | Format |
|---|---|---|---|
| Wonka | WONKA AD CC | No | Standard |
| Civil War | CIVIL WAR AD CC | No | Standard |
| Lilo & Stitch | LILO & DOLBY AD CC | Yes ("Stitch" dropped) | Dolby Cinema |
| It Ends with Us | IT ENDS WITH AD CC | Yes ("Us" dropped) | Standard |

- "AD CC" (Audio Description + Closed Captioning) is appended to ALL titles.
- For premium formats, the format name (DOLBY, IMAX, etc.) is inserted before "AD CC".
- Title gets truncated from the right to make room for format + accessibility codes.
- Estimated field limit: ~18-20 characters total.

## Golden JSON

```json
[
  {
    "id": "amc-24-25-001",
    "image_path": "amc/amc-24-25-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "AMC Assembly Row, Somerville MA. 'WONKA AD CC' — strip 'AD CC' suffix. Monday MLK Day showing. Standard pricing $14.99. Chain not printed — inferred from 'amc amazing' watermark.",
    "expected": {
      "movie_title": "Wonka",
      "theater_chain": "AMC",
      "theater_name": "AMC Assembly Row 12",
      "theater_location": "Somerville, MA",
      "showtime": "2024-01-15T18:45:00",
      "seat_info": {
        "row": "L",
        "seat": "7"
      },
      "format": "Standard",
      "auditorium": "5",
      "ticket_price": {
        "amount": 14.99,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "amc-24-25-002",
    "image_path": "amc/amc-24-25-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "AMC Assembly Row, Somerville MA. 'CIVIL WAR AD CC' — A24 film, not MCU. Discount Tuesday: $14.99 - $7.99 savings = $7.00 total. Use $7.00 as ticket_price (actual paid). Same Row L as Wonka ticket.",
    "expected": {
      "movie_title": "Civil War",
      "theater_chain": "AMC",
      "theater_name": "AMC Assembly Row 12",
      "theater_location": "Somerville, MA",
      "showtime": "2024-04-23T18:15:00",
      "seat_info": {
        "row": "L",
        "seat": "3"
      },
      "format": "Standard",
      "auditorium": "7",
      "ticket_price": {
        "amount": 7.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "amc-24-25-003",
    "image_path": "amc/amc-24-25-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "AMC Boston Common, Boston MA. 'LILO & DOLBY AD CC' = 'Lilo & Stitch' in Dolby Cinema — 'Stitch' truncated to fit 'DOLBY' format. $22.99 Dolby premium. Group purchase ticket 3 of 3+. Adjacent seat to ticket 4 (H9 + H10).",
    "expected": {
      "movie_title": "Lilo & Stitch",
      "theater_chain": "AMC",
      "theater_name": "AMC Boston Common 19",
      "theater_location": "Boston, MA",
      "showtime": "2025-05-25T16:00:00",
      "seat_info": {
        "row": "H",
        "seat": "9"
      },
      "format": "Dolby Cinema",
      "auditorium": "14",
      "ticket_price": {
        "amount": 22.99,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "amc-24-25-004",
    "image_path": "amc/amc-24-25-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Same showing as amc-24-25-003. Group purchase ticket 2 of 3+. Adjacent seat H10 (next to H9). Transaction # ends in 0002 vs 0003.",
    "expected": {
      "movie_title": "Lilo & Stitch",
      "theater_chain": "AMC",
      "theater_name": "AMC Boston Common 19",
      "theater_location": "Boston, MA",
      "showtime": "2025-05-25T16:00:00",
      "seat_info": {
        "row": "H",
        "seat": "10"
      },
      "format": "Dolby Cinema",
      "auditorium": "14",
      "ticket_price": {
        "amount": 22.99,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "amc-24-25-005",
    "image_path": "amc/amc-24-25-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "AMC Boston Common, Boston MA. 'IT ENDS WITH AD CC' = 'It Ends with Us' — 'Us' truncated. Boston Common standard pricing $15.49 ($0.50 more than suburban Assembly Row). Row Q = further back seating.",
    "expected": {
      "movie_title": "It Ends with Us",
      "theater_chain": "AMC",
      "theater_name": "AMC Boston Common 19",
      "theater_location": "Boston, MA",
      "showtime": "2024-08-18T18:45:00",
      "seat_info": {
        "row": "Q",
        "seat": "14"
      },
      "format": "Standard",
      "auditorium": "9",
      "ticket_price": {
        "amount": 15.49,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  }
]
```
