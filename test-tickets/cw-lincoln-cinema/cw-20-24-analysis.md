# CW Theatres — "20-24" Variant (Cinemaworld Thin Paper, Pre-Rebrand)

## Variant Overview
- **Chain**: Cinemaworld (now CW Theatres — rebranded sometime between 2024-2025)
- **Location analyzed**: Cinemaworld Lincoln 16, Lincoln, RI
- **Ticket type**: Physical thin paper ticket with perforated tear-off stub
- **Visual identifiers**: Plain white paper, no logos or watermarks. Dot-matrix/typewriter-style font. Each ticket has TWO halves: a main stub (left) and a smaller tear-off stub (right) with condensed info.
- **Era**: 2020-2024 (pre-rebrand to "CW Theatres")
- **Website**: www.cwtheatres.com (current)

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

White thin paper ticket with a perforated tear-off section. Two halves visible per ticket — the left (main) stub has full info, the right (tear-off) stub has condensed duplicate info. Main stub layout, top-to-bottom:

1. **Movie title** — large bold font, ALL CAPS (e.g. "THE EQUALIZER 3", "THE MARVELS"). Long titles may wrap.
2. **Day + Date + Time** — single line: abbreviated day, MM/DD/YY date, HH:MM time (e.g. "Mon 09/04/23 11:05"). Time appears to be 12hr but without AM/PM on the main stub.
3. **MPAA rating** — appears to the right of the date/time line (e.g. "R", "PG13").
4. **Ticket type + Price** — single line with abbreviated type and dollar amount (e.g. "STMat $9.00", "SRMat $9.00").
5. **Auditorium + Seating** — "Auditorium" label, then a boxed auditorium number, followed by comma-separated seat info: "Row,Seat" (e.g. "8 | 0,14" meaning Auditorium 8, Row O, Seat 14).
6. **Theater name** — "Cinemaworld Lincoln 16" (NOT "CW Theatres" — this is pre-rebrand).
7. **Station code** — "ST0-0-0" (likely a POS terminal identifier).
8. **Transaction number** — long numeric string (e.g. "090423005727", "111123024845"). Appears to encode the date: 0904230... = 09/04/23.

Tear-off stub (right side) repeats: title, rating, date+time (with AM/PM suffix), ticket type + price, auditorium + seat, partial theater name (truncated: "Cinemaworld L..."), station code, transaction number.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Theater name is "Cinemaworld", NOT "CW Theatres"**: This variant predates the rebrand. The chain name printed is "Cinemaworld Lincoln 16". Map `theater_chain` to "CW Theatres" (current name) but `theater_name` should reflect what's printed: "Cinemaworld Lincoln 16".
- **Two-digit year**: Date is MM/DD/YY (e.g. "09/04/23" = September 4, 2023). Must prepend "20" to get full year.
- **Abbreviated ticket types**: "STMat" = Student Matinee, "SRMat" = Senior Matinee. Same abbreviation style as the "M" variant but with "STMat" as a new code.
- **Seat format is comma-separated**: The auditorium section shows "[boxed number] Row,Seat" — e.g. "8 | 0,14". The "0" is likely Row O (letter O, not zero) since cinemas typically use letters for rows. Alternatively it could be a numeric row. Extract as-is and note the ambiguity.
- **Duplicate stubs**: Each ticket appears twice (main + tear-off). Extract only ONCE per movie. The tear-off is a condensed copy — don't double-count.
- **AM/PM only on tear-off**: The main stub shows time without AM/PM ("11:05"), but the tear-off shows "11:05AM". Use the tear-off to confirm AM/PM.
- **ALL CAPS titles**: Movie titles are printed in uppercase. Normalize to title case for the extraction (e.g. "THE MARVELS" → "The Marvels").
- **Transaction number encodes date**: The long number at the bottom starts with the date digits (090423... for 09/04/23). Use as confirmation_number.
- **No barcode or QR code**: Like the "M" variant, this variant has no scannable codes.
- **Multiple tickets in one image**: This photo contains TWO different movie tickets. Each must be extracted as a separate entry.

## Differences from Other Variants

| Feature | "M" Variant (Cardboard) | "20-24" Variant (Cinemaworld) | "26" Variant (CW Thin Paper) |
|---|---|---|---|
| Material | Thick cardboard | Thin paper with tear-off | Thin paper, no tear-off |
| Theater name | CW Theatres | Cinemaworld Lincoln 16 | Not printed |
| Branding | "M" crown, black/white/gold | None | None |
| Title case | Mixed case | ALL CAPS | Mixed case |
| Price | Shown ($9.00) | Shown ($9.00) | Not shown |
| Seat/Row | Separate fields (Row: O, Seat: 11) | Comma format (0,14) | Not shown |
| Rating | Shown (PG13) | Shown (R, PG13) | Not shown |
| Ticket type | Abbreviated (SRMat) | Abbreviated (STMat, SRMat) | Full word (Senior) |
| Date format | MM/DD/YYYY (partial year) | MM/DD/YY (2-digit year) | "Month Day" (no year) |
| Scannable code | None | None | QR code |
| Tear-off stub | No | Yes (with AM/PM) | No |
| End time | Not shown | Not shown | Shown |

## Raw Field Extraction

### cw-20-24-The_Marvels+The_Equalizer_3.HEIC

> Note: This single image contains TWO tickets (4 stubs total — 2 main + 2 tear-off).

#### Ticket 1: The Equalizer 3 (top)

**Main stub (left), top to bottom:**

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | THE EQUALIZER 3 |
| Day | Mon |
| Date | 09/04/23 |
| Showtime | 11:05 (AM per tear-off) |
| MPAA Rating | R |
| Ticket Type | STMat |
| Ticket Price | $9.00 |
| Auditorium | 8 |
| Seat | 0,14 (Row O?, Seat 14) |
| Station | ST0-0-0 |
| Transaction # | 090423005727 |
| Barcode | NA |
| QR Code | NA |

**Tear-off stub (right) confirms:** THE EQUALIZE / 3, R, 9/04/23 11:05AM, STMat $9.00, Auditorium 8 | 0,14, Cinemaworld L..., ST0-0-0, 090423005727

**Observations:**
- Title truncates on tear-off ("THE EQUALIZE" / "3") — wraps differently than main stub.
- "STMat" = Student Matinee — new abbreviation not seen on "M" variant. $9.00 matches the Senior Matinee price.
- The Equalizer 3 released September 1, 2023. Date 09/04/23 (Labor Day Monday) matches.
- Seat "0,14" — the "0" could be row O (letter) or row 0 (number). The comma separates row from seat.
- Transaction number starts with date: 090423 = 09/04/23.

---

#### Ticket 2: The Marvels (bottom)

**Main stub (left), top to bottom:**

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | THE MARVELS |
| Day | Sat |
| Date | 11/11/23 |
| Showtime | 11:30 (AM per tear-off) |
| MPAA Rating | PG13 |
| Ticket Type | SRMat |
| Ticket Price | $9.00 |
| Auditorium | 7 |
| Seat | 0,13 (Row O?, Seat 13) |
| Station | ST0-0-0 |
| Transaction # | 111123024845 |
| Barcode | NA |
| QR Code | NA |

**Tear-off stub (right) confirms:** THE MARVELS, PG13, 11/11/23 11:30A... (cut off), SRMat $9.00, Auditorium 7 | 0,13, Cinemaworld L..., ST0-0-0, 111123024845

**Observations:**
- "SRMat" = Senior Matinee — same abbreviation seen on "M" variant. $9.00 price.
- The Marvels released November 10, 2023. Date 11/11/23 (Saturday, day after release) matches perfectly.
- Transaction number starts with 111123 = 11/11/23.
- Both tickets show the same station "ST0-0-0" — likely the same kiosk/terminal.
- Both have similar seat patterns in the same row (0,13 and 0,14) — suggesting a regular patron with a preferred seat area.

## Golden JSON

```json
[
  {
    "id": "cw-20-24-001",
    "image_path": "cw-lincoln-cinema/cw-20-24-The_Marvels+The_Equalizer_3.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Pre-rebrand 'Cinemaworld' era ticket. STMat = Student Matinee. Two-digit year. Seat format '0,14' — row may be letter O or number 0. Multi-ticket image (extract this one only for Equalizer 3).",
    "expected": {
      "movie_title": "The Equalizer 3",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2023-09-04T11:05:00",
      "seat_info": {
        "row": "O",
        "seat": "14"
      },
      "format": "Standard",
      "auditorium": "8",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-20-24-002",
    "image_path": "cw-lincoln-cinema/cw-20-24-The_Marvels+The_Equalizer_3.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Pre-rebrand 'Cinemaworld' era ticket. SRMat = Senior Matinee. Same image as cw-20-24-001 (two tickets in one photo). Seat '0,13' interpreted as Row O, Seat 13.",
    "expected": {
      "movie_title": "The Marvels",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2023-11-11T11:30:00",
      "seat_info": {
        "row": "O",
        "seat": "13"
      },
      "format": "Standard",
      "auditorium": "7",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  }
]
```
