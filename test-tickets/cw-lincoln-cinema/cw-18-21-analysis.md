# CW Theatres — "18-21" Variant (Cinemaworld Coca-Cola Branded, With Seating)

## Variant Overview
- **Chain**: Cinemaworld (pre-rebrand to CW Theatres)
- **Location analyzed**: Cinemaworld Lincoln 16, Lincoln, RI
- **Ticket type**: Physical cardstock ticket with Coca-Cola partnership branding (same stock as pre-2020 variant)
- **Visual identifiers**: Same light blue/pink Coca-Cola circle design as pre-2020 variant. Large auditorium number in bold. "THEATRES" text in circle area.
- **Era**: 2018-2021 (overlaps with pre-2020 variant but has key differences)
- **Website**: www.cwtheatres.com (current)

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Same small-format Coca-Cola branded cardstock as the pre-2020 variant — light blue background, pink/coral circle with branding, large bold auditorium number. Key layout difference: **this variant includes assigned seat information**. Fields (reading the ticket rotated to normal orientation):

1. **Theater name** — "Cinemaworld Lincoln 16" along one edge.
2. **Movie title** — ALL CAPS, may be truncated for long titles (e.g. "F9 THE FAST SAG" for "F9: The Fast Saga").
3. **MPAA rating** — e.g. "PG13".
4. **Day + Date** — abbreviated day + "Month Day" with NO year (e.g. "Sat Aug 21", "Sun Nov 25").
5. **Showtime** — HH:MM AM/PM (e.g. "8:30 PM", "10:30 AM", "1:00 PM").
6. **Ticket type + Price** — abbreviated type + dollar amount (e.g. "STEve$9.00", "ADMat$10.00", "STMat$8.00"). No space between type and "$".
7. **Transaction number** — long numeric string encoding the date (e.g. "00404-99..." with MMDDYY embedded).
8. **Row + Seat** — "Row-X, Seat-Y" format with explicit labels and dash separators (e.g. "Row-N, Seat-72", "Row-O, Seat-15"). **This is the key difference from the pre-2020 variant.**
9. **Auditorium number** — large bold digit in the pink circle design.
10. **No barcode or QR code**.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Has seat info (unlike pre-2020)**: This variant added reserved seating to the ticket. Format is "Row-X, Seat-Y" with explicit labels. The pre-2020 variant (2017 era) had NO seat information — suggesting Cinemaworld added reserved seating between 2017 and 2018.
- **Same Coca-Cola design as pre-2020**: Visually identical ticket stock. The only way to distinguish from pre-2020 is the presence of seat information. Gemini should extract seat info if present.
- **Title truncation**: Same issue as pre-2020 — long titles are cut off. "F9 THE FAST SAG" = "F9: The Fast Saga", "MARKSMAN" = "The Marksman" (drops "The"). Gemini must infer full titles.
- **No year on date**: Same as pre-2020 — only "Month Day" shown. Year must be inferred from movie release dates.
- **Transaction number encodes date + year**: Same pattern as pre-2020. The date portion (MMDDYY) is embedded in the long transaction number. Can confirm year.
- **Ticket type abbreviations expanded**: More variety than pre-2020:
  - "STEve" = Student Evening
  - "STMat" = Student Matinee
  - "ADMat" = Adult Matinee
  - "AdEve" = Adult Evening (seen on pre-2020)
  - "SRMat" = Senior Matinee (seen on "M" variant)
- **Price varies by era**: $8.00 in 2018 → $9.00-$10.00 in 2021. Prices increased over time.
- **No-space ticket type + price**: "STEve$9.00" has no space between the type and the dollar amount. Gemini must parse this as two fields.
- **Preferred seating patterns**: Multiple tickets may show the same Row-Seat combo (e.g. Row-N, Seat-72 in Theatre 15 appears across different movies) — indicating a regular patron with a preferred seat.
- **"Cinemaworld" name**: Still pre-rebrand era. Map theater_chain to "CW Theatres" (current) but theater_name as "Cinemaworld Lincoln 16".

## Differences from Pre-2020 Variant

| Feature | Pre-2020 (No Seats) | 18-21 (With Seats) |
|---|---|---|
| Seat info | Not shown | "Row-X, Seat-Y" format |
| Ticket stock | Same Coca-Cola design | Same Coca-Cola design |
| Ticket types | AdEve only (in samples) | STEve, STMat, ADMat (more variety) |
| Price range | $10.00 (2017-2018) | $8.00-$10.00 (2018-2021) |
| Era | 2017-2018 | 2018-2021 |
| Reserved seating | No | Yes |

## Raw Field Extraction

### cw-18-21-5_Movies.HEIC

> Note: This single image contains FIVE tickets.

#### Ticket 1: Free Guy (top left)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | FREE GUY |
| MPAA Rating | PG13 |
| Day | Sat |
| Date | Aug 21 |
| Showtime | 8:30 PM |
| Ticket Type | STEve |
| Ticket Price | $9.00 |
| Row | N |
| Seat | 72 |
| Auditorium | 15 |
| Transaction # | 00404-99... |
| QR/Barcode | NA |

**Observations:**
- Free Guy (PG-13) released August 13, 2021. August 21 was a Saturday in 2021 — confirmed 2021.
- "STEve" = Student Evening at $9.00.
- Row N, Seat 72 in Theatre 15 — large auditorium with high seat numbers.

---

#### Ticket 2: Voyagers (middle left)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | VOYAGERS |
| MPAA Rating | PG13 |
| Day | Sun |
| Date | Apr 11 |
| Showtime | 1:00 PM |
| Ticket Type | ADMat |
| Ticket Price | $10.00 |
| Row | N |
| Seat | 72 |
| Auditorium | 15 |
| Transaction # | 00013-404112113... |
| QR/Barcode | NA |

**Observations:**
- Voyagers (PG-13) released April 9, 2021. April 11 was a Sunday in 2021 — confirmed 2021.
- "ADMat" = Adult Matinee at $10.00 — $1 more than student pricing.
- Same seat as Free Guy: Row N, Seat 72, Theatre 15. Patron's preferred spot.

---

#### Ticket 3: The Marksman (center)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | MARKSMAN |
| MPAA Rating | PG13 |
| Day | Sun |
| Date | Feb 28 |
| Showtime | 1:35 PM |
| Ticket Type | STMat |
| Ticket Price | $9.00 |
| Row | L |
| Seat | 7 |
| Auditorium | 3 |
| Transaction # | 00017-840228... |
| QR/Barcode | NA |

**Observations:**
- The Marksman (PG-13) released January 22, 2021. February 28 was a Sunday in 2021 — confirmed 2021.
- Title drops "The" — "MARKSMAN" printed instead of "THE MARKSMAN".
- "STMat" = Student Matinee at $9.00.
- Smaller auditorium (Theatre 3) with lower seat numbers (L7 vs N72).

---

#### Ticket 4: F9: The Fast Saga (right of center)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | F9 THE FAST SAG (truncated) |
| MPAA Rating | PG13 |
| Day | Sat |
| Date | Jul 3 |
| Showtime | 7:15 PM |
| Ticket Type | STEve |
| Ticket Price | $9.00 |
| Row | — |
| Seat | — |
| Auditorium | 14 |
| Transaction # | 00731-990703211904... |
| QR/Barcode | NA |

**Observations:**
- F9: The Fast Saga (PG-13) released June 25, 2021. July 3 was a Saturday in 2021 — opening week Saturday, confirmed 2021.
- Severely truncated title: "F9 THE FAST SAG" — missing "A" at the end of "SAGA". Same aggressive truncation as pre-2020 variant.
- "STEve" = Student Evening at $9.00.
- Large auditorium (Theatre 14). Seat info partially obscured by overlapping tickets.

---

#### Ticket 5: Creed II (far right)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | CREED 2 |
| MPAA Rating | PG13 |
| Day | Sun |
| Date | Nov 25 |
| Showtime | 10:30 AM |
| Ticket Type | STMat |
| Ticket Price | $8.00 |
| Row | O |
| Seat | 15 |
| Auditorium | 16 |
| Transaction # | 00108-85112518101905 |
| QR/Barcode | NA |

**Observations:**
- Creed II (PG-13) released November 21, 2018. November 25 was a Sunday in 2018 — confirmed **2018**. This is the earliest ticket in this batch, predating the 2021 tickets by 3 years.
- Title printed as "CREED 2" — uses numeral instead of Roman numeral "II". Gemini must match "Creed 2" to "Creed II" in TMDB.
- $8.00 — cheapest ticket in the collection. 2018 Student Matinee pricing was $1 less than 2021.
- 10:30 AM showtime — earliest morning showing across all samples.
- Transaction number: "00108-85**112518**..." → 11/25/18 = November 25, 2018. Year confirmed.
- Row O, Seat 15 in Theatre 16. Different from the N-72 preferred seat in Theatre 15.
- **Confirms this variant spans at least 2018-2021** — same ticket stock and design used for 3+ years.

## Price Evolution

| Year | Matinee (Student) | Matinee (Adult) | Evening (Student) |
|---|---|---|---|
| 2018 | $8.00 | — | — |
| 2021 | $9.00 | $10.00 | $9.00 |

## Golden JSON

```json
[
  {
    "id": "cw-18-21-001",
    "image_path": "cw-lincoln-cinema/cw-18-21-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Coca-Cola branded with seat info. STEve = Student Evening. Same Row-N/Seat-72 as Voyagers ticket — regular patron seat. Txn # confirms 2021.",
    "expected": {
      "movie_title": "Free Guy",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2021-08-21T20:30:00",
      "seat_info": {
        "row": "N",
        "seat": "72"
      },
      "format": "Standard",
      "auditorium": "15",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "cw-18-21-002",
    "image_path": "cw-lincoln-cinema/cw-18-21-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "ADMat = Adult Matinee ($1 more than student). Same Row-N/Seat-72/Theatre-15 as Free Guy — preferred spot.",
    "expected": {
      "movie_title": "Voyagers",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2021-04-11T13:00:00",
      "seat_info": {
        "row": "N",
        "seat": "72"
      },
      "format": "Standard",
      "auditorium": "15",
      "ticket_price": {
        "amount": 10.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "cw-18-21-003",
    "image_path": "cw-lincoln-cinema/cw-18-21-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Title drops 'The' — printed as 'MARKSMAN'. STMat = Student Matinee. Smaller auditorium (Theatre 3).",
    "expected": {
      "movie_title": "The Marksman",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2021-02-28T13:35:00",
      "seat_info": {
        "row": "L",
        "seat": "7"
      },
      "format": "Standard",
      "auditorium": "3",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "cw-18-21-004",
    "image_path": "cw-lincoln-cinema/cw-18-21-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Severely truncated: 'F9 THE FAST SAG' = 'F9: The Fast Saga'. STEve = Student Evening. Seat info partially obscured.",
    "expected": {
      "movie_title": "F9: The Fast Saga",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2021-07-03T19:15:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "14",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.80
    }
  },
  {
    "id": "cw-18-21-005",
    "image_path": "cw-lincoln-cinema/cw-18-21-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Earliest ticket: Nov 2018. 'CREED 2' printed (numeral not Roman 'II'). Cheapest at $8.00 (2018 pricing). Txn # '00108-85112518...' confirms 11/25/18.",
    "expected": {
      "movie_title": "Creed II",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2018-11-25T10:30:00",
      "seat_info": {
        "row": "O",
        "seat": "15"
      },
      "format": "Standard",
      "auditorium": "16",
      "ticket_price": {
        "amount": 8.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  }
]
```
