# AMC Theatres — 2022 (Thermal Receipt, Barcode Variant)

## Variant Overview
- **Chain**: AMC Theatres
- **Location analyzed**: AMC Burlington Cinema 10 (Burlington, MA)
- **Ticket type**: Physical thermal receipt
- **Visual identifiers**: Same "amc amazing" watermark pattern with small icons (popcorn, rockets, planets, skulls, stars) as the 24-25 variant. **Key difference**: uses a traditional 1D barcode instead of a QR code. Transaction number printed 3 times (under barcode, as text, with "C" prefix). Includes "STATION" field at bottom.
- **Era**: 2022
- **Website**: www.amctheatres.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Standard-width thermal receipt with the same "amc amazing" watermark pattern as the 24-25 variant. Same single-column layout but with a traditional barcode instead of QR code. Layout top-to-bottom:

1. **Location name + store ID** — theater location with unit number (e.g. "Burlingtn10 Unit0814"). Location name may be truncated (e.g. "Burlington" → "Burlingtn"). The number after the location name is the screen count (10 = 10-screen venue). Chain name "AMC" is NOT printed.
2. **Movie title line** — ALL CAPS. Same `{TITLE} AD CC` pattern as 24-25, but with **mid-word character truncation** instead of word-boundary truncation (e.g. "STRANGE WORL AD CC" — "World" cut to "WORL" mid-word).
3. **Showtime + Day + Date** — single line: "H:MMpm Day MM/DD/YYYY" (e.g. "7:15pm Wed 11/30/2022"). Same format as 24-25 with full 4-digit year.
4. **Ticket type + Base price** — "ADULT* $XX.XX" (e.g. "ADULT* $13.49").
5. **Savings** — "Savings $0.00".
6. **Tax** — "$0.00".
7. **Total** — "$13.49".
8. **Seat code** — in a dark/highlighted box: row letter + seat number combined (e.g. "G2" = Row G, Seat 2). Same format as 24-25.
9. **MPAA rating** — standalone next to the seat box (e.g. "PG").
10. **Auditorium number** — in a dark box on the right side (e.g. "2"). Same position as 24-25 but may appear slightly smaller.
11. **Transaction number** — printed under the barcode, then repeated as plain text, then again with "C" prefix. Three repetitions total (e.g. "0031628505350001").
12. **1D Barcode** — traditional barcode (NOT a QR code). This is the primary visual difference from the 24-25 variant.
13. **Station + Date/Time of sale** — "STATION: NNN  MM/DD/YYYY H:MMpm" (e.g. "STATION: 003  11/30/2022 7:05PM"). The STATION field identifies the terminal/kiosk. This field does not appear on the 24-25 variant.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Mid-word character truncation**: Unlike the 24-25 variant which drops whole words, this 2022 variant truncates mid-word at a hard character limit. "STRANGE WORL AD CC" — "World" is cut to "WORL" (missing "D"). The ~18-character field limit is the same, but the truncation method is less intelligent. Gemini must infer "WORL" → "World" → "Strange World".
- **"AD CC" suffix**: Same as 24-25 — Audio Description + Closed Captioning appended to every title. Strip before extraction.
- **Barcode, NOT QR code**: This 2022 ticket uses a traditional 1D barcode. The 24-25 variant switched to QR codes. This is the easiest way to visually distinguish the two variants.
- **Transaction number printed 3 times**: The same number appears (1) below the barcode, (2) as plain text, and (3) with a "C" prefix. All three are the same number — extract once.
- **"STATION" field**: "STATION: 003" identifies the terminal/kiosk. This field is unique to the 2022 variant — the 24-25 variant does not show station info. This is metadata, not movie data.
- **Location name truncation**: "Burlington" → "Burlingtn" (drops "o"). Same truncation behavior as 24-25's "Boston Common" → "Boston Comm". Location names are truncated to fit the field width.
- **Screen count in location name**: "Burlingtn10" — the "10" after the location name is the screen count (10-screen venue). Do NOT confuse with the auditorium number (which is "2" in the dark box). Same pattern as Showcase's "Attleboro 12".
- **Lower 2022 pricing**: $13.49 in 2022 vs $14.99 in 2024 at comparable suburban locations. ~$1.50 price increase over 2 years.
- **Faded thermal paper**: This 2022 ticket shows visible fading compared to newer 24-25 tickets. Thermal paper degrades over time — OCR may have lower confidence on older tickets.
- **Time of sale vs showtime**: Sale time (7:05 PM) is 10 minutes before showtime (7:15 PM). Same pattern as 24-25 — extract the showtime, not the sale time.
- **No chain name printed**: Same as 24-25 — "AMC" does not appear in the text fields. Chain identified only by the "amc amazing" watermark.

## Differences from 24-25 Variant

| Feature | 2022 Variant (Barcode) | 24-25 Variant (QR Code) |
|---|---|---|
| Scannable code | 1D barcode | QR code |
| Title truncation | Mid-word character cut ("WORL") | Word-boundary drop ("IT ENDS WITH") |
| Transaction # display | Printed 3 times (barcode + text + "C" prefix) | Printed once |
| Station field | "STATION: 003" shown | Not shown |
| Pricing (suburban standard) | $13.49 (2022) | $14.99 (2024) |
| Watermark | "amc amazing" icons | "amc amazing" icons (same) |
| Layout structure | Same | Same |
| Seat format | Same (highlighted box, e.g. "G2") | Same (highlighted box, e.g. "L7") |
| Date format | MM/DD/YYYY (4-digit year) | MM/DD/YYYY (4-digit year, same) |
| "ADULT*" + Savings/Tax/Total | Yes | Yes (same) |

## Raw Field Extraction

### amc-22-Strange_World.HEIC

> Note: Single ticket. Pen visible in photo for scale reference — not ticket data.

#### Ticket 1: Strange World

| Field | Raw Value |
|---|---|
| Location | Burlingtn10 Unit0814 |
| Movie | STRANGE WORL AD CC (truncated from "Strange World") |
| Showtime | 7:15pm |
| Day | Wed |
| Date | 11/30/2022 |
| Ticket Type | ADULT* |
| Base Price | $13.49 |
| Savings | $0.00 |
| Tax | $0.00 |
| Total | $13.49 |
| Seat | G2 (Row G, Seat 2) |
| MPAA Rating | PG |
| Auditorium | 2 |
| Barcode | Yes (1D barcode) |
| QR Code | NA |
| Transaction # | 0031628505350001 |
| Station | 003 |
| Date/Time of Sale | 11/30/2022 7:05 PM |

**Observations:**
- Strange World (PG) released November 23, 2022. November 30, 2022 was a Wednesday — one week after release. Confirmed in theaters.
- "Burlingtn10 Unit0814" = AMC Burlington Cinema 10, Burlington, MA. "Burlingtn" = "Burlington" truncated (drops "o"). "10" = 10-screen venue. "Unit0814" is the store number.
- **Mid-word title truncation**: "STRANGE WORL AD CC" — "World" cut to "WORL" (missing final "D"). This is character-level truncation, not the word-boundary truncation seen in the 24-25 variant.
- $13.49 standard adult pricing at a suburban MA location in 2022. Compare to $14.99 at Assembly Row (also suburban MA) in 2024 — ~$1.50 increase over 2 years.
- Time of sale 7:05 PM, showtime 7:15 PM — purchased 10 minutes before showtime.
- Row G, Seat 2 — front-middle area, aisle seat. Small auditorium (2) in a 10-screen venue.
- Transaction number "0031628505350001" — ends in "0001", suggesting first (or only) ticket in this purchase.
- Station 003 — terminal/kiosk identifier. Third terminal at this location.
- **1D barcode** is the most distinctive visual difference from the 24-25 QR code variant.
- Ticket shows visible thermal paper fading — 2+ years of aging. All text remains legible but contrast is lower than newer tickets.

## AMC Price Evolution (Suburban MA)

| Year | Location | Standard Price |
|---|---|---|
| 2022 | Burlington (10-screen) | $13.49 |
| 2024 | Assembly Row (12-screen) | $14.99 |

- ~11% price increase over 2 years ($1.50).
- Smaller venues (Burlington 10) may have slightly lower base pricing than larger venues (Assembly Row 12), but year-over-year inflation is the primary driver.

## AMC Truncation Method Evolution

| Era | Method | Example |
|---|---|---|
| 2022 | Hard character cut (mid-word) | "STRANGE WORL" (cuts "D" from "World") |
| 2024-25 | Word-boundary drop | "IT ENDS WITH" (drops entire "Us") |
| 2024-25 | Word-boundary drop + format priority | "LILO &" + "DOLBY" (drops "Stitch" for format) |

The POS system appears to have been updated between 2022 and 2024 to use smarter word-boundary truncation instead of raw character cuts.

## Golden JSON

```json
{
  "id": "amc-22-001",
  "image_path": "amc/amc-22-Strange_World.HEIC",
  "source": "manual",
  "added_date": "2026-02-15",
  "notes": "AMC Burlington Cinema 10, Burlington MA. 2022 barcode variant (1D barcode, not QR). 'STRANGE WORL AD CC' — mid-word truncation ('D' cut from 'World'). $13.49 suburban 2022 pricing. Station 003 terminal. Transaction # printed 3 times. Visible thermal fading.",
  "expected": {
    "movie_title": "Strange World",
    "theater_chain": "AMC",
    "theater_name": "AMC Burlington Cinema 10",
    "theater_location": "Burlington, MA",
    "showtime": "2022-11-30T19:15:00",
    "seat_info": {
      "row": "G",
      "seat": "2"
    },
    "format": "Standard",
    "auditorium": "2",
    "ticket_price": {
      "amount": 13.49,
      "currency": "USD"
    },
    "confidence_score": 0.90
  }
}
```
