# CW Theatres — "21-22" Variant (Cinemaworld Plain Paper, Two-Part Ticket)

## Variant Overview
- **Chain**: Cinemaworld (pre-rebrand to CW Theatres)
- **Location analyzed**: Cinemaworld Lincoln 16, Lincoln, RI
- **Ticket type**: Plain white paper ticket with two parts — LEFT side (main info) and RIGHT side (condensed duplicate). Most tickets in this sample show the LEFT side; one shows the RIGHT side partially.
- **Visual identifiers**: Plain white paper, no logos or watermarks. Standard printer font. Each ticket has TWO halves (left + right) — identical to the 20-24 variant. "Auditorium" label above a boxed auditorium number.
- **Era**: 2021-2022 (extends the known range of the 20-24 variant back to 2021)
- **Website**: www.cwtheatres.com (current)

## Relationship to 20-24 Variant

**This is the SAME ticket format as the "20-24" variant** — plain white paper, comma-separated seats, 2-digit year, two-part ticket (left + right), "Cinemaworld Lincoln 16", "ST0-0-0" station code. The only minor differences are cosmetic (slightly different "Auditorium" label positioning, a "1" indicator next to the auditorium number). The 20-24 variant's date range should be understood as **at least 2021-2024** based on this evidence.

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Plain white paper ticket with two halves (left side = main info, right side = condensed duplicate). Most tickets in this image show the LEFT side. Layout of the LEFT side, top-to-bottom:

1. **Movie title** — bold/large font, ALL CAPS (e.g. "THE LOST CITY", "UNCHARTED", "AMBULANCE"). Long titles are truncated (e.g. "SPIDERMAN NO WAY" for "Spider-Man: No Way Home").
2. **Day + Date + Time + Rating** — single dense line: "Day MM/DD/YY H:MMP  RATING" (e.g. "Sun 03/27/22 2:30P  PG13"). 2-digit year. Time uses "P" or "PM" for PM (inconsistent — some show just "P", others show "PM").
3. **Ticket type + Price** — "TYPE $XX.XX" (e.g. "ADMat $10.00", "STMat $9.00", "STEve $9.00", "SREve $9.00"). Same abbreviation system as all CW variants.
4. **"Auditorium" label** — explicit text label.
5. **Auditorium number** — in a boxed/bordered number (e.g. [9], [16], [13], [15], [7]). A "1" appears to the right of the box (meaning unclear — possibly quantity, section, or floor indicator).
6. **Seat** — comma-separated format: "ROW,SEAT" (e.g. "N,9", "N,12", "J,8", "0,14"). Same format as the 20-24 variant.
7. **Theater name** — "Cinemaworld Lincoln 16".
8. **Station code** — "ST0-0-0" (POS terminal identifier). Same code across all tickets.
9. **Transaction number** — long numeric string encoding the date (e.g. "032722134856" → 03/27/22). Note: for advance purchases, the transaction date may differ from the showtime date.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Two-part ticket**: Same as 20-24 variant — left side has full info, right side has condensed duplicate. When scanning, extract from the LEFT side only. If the RIGHT side is visible, do not double-count.
- **Title truncation**: "SPIDERMAN NO WAY" = "Spider-Man: No Way Home" — drops "Home", removes hyphen, merges "Spider-Man" into "SPIDERMAN". Similar to the 20-24 variant's truncation of long titles.
- **"P" vs "PM" inconsistency**: Some tickets show time as "2:30P" (just "P"), others as "7:00PM" (full "PM"). Both mean the same thing. Appears random, not era-based (both seen in 2021 tickets one month apart).
- **Seat format**: Comma-separated "ROW,SEAT" — identical to the 20-24 variant. "N,9" = Row N, Seat 9. "0,14" = Row O (or 0), Seat 14. Same ambiguity as 20-24 for the "0" row.
- **"1" next to auditorium**: A "1" appears to the right of every boxed auditorium number. Meaning is unclear — possibly quantity (1 admission), section number, or a screen indicator. Present on all 5 tickets. Not critical for extraction.
- **Advance purchase detection**: Transaction number "113021113750" on the Spider-Man ticket encodes 11/30/21 — but the showtime is 12/16/21. This is a 16-day advance purchase (pre-ordered for the Thursday night preview). For same-day purchases, the transaction date matches the showtime date.
- **Thursday night preview**: Spider-Man: No Way Home ticket dated 12/16/21 (Thursday) — the movie released 12/17/21 (Friday). This is a Thursday night preview, purchased 16 days in advance.
- **Ticket type pricing**: Adult Matinee ($10.00) is MORE than Student/Senior Evening ($9.00). This means the $1 premium is for "Adult" vs discount categories (Student/Senior), NOT for evening vs matinee. Students and Seniors pay a flat $9.00 regardless of time.
- **Same prices as 18-21 and 20-24**: STEve $9.00, STMat $9.00, ADMat $10.00 — pricing is unchanged from the 18-21 Coca-Cola era through at least 2022.

## Ticket Types Expanded

| Code | Full Name | Price | Time |
|---|---|---|---|
| ADMat | Adult Matinee | $10.00 | Afternoon |
| STMat | Student Matinee | $9.00 | Afternoon |
| STEve | Student Evening | $9.00 | Evening |
| SREve | Senior Evening | $9.00 | Evening |

- Adult is always $1 more than Student/Senior.
- Student and Senior are the same price regardless of matinee/evening.
- "Eve" (evening) and "Mat" (matinee) apply based on showtime, not a fixed cutoff.
- 4:50 PM (Ambulance, Sunday) = Evening ("STEve"). 2:30 PM (Lost City, Sunday) = Matinee ("ADMat"). The cutoff appears to be somewhere around 3-4 PM.

## Raw Field Extraction

### cw-21-22-5_Movies.HEIC

> Note: This image contains FIVE tickets showing the LEFT side, plus one partially visible RIGHT side (tear-off) behind two of the tickets. Five UNIQUE movies.

#### Ticket 1: The Lost City (top left)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | THE LOST CITY |
| Day | Sun |
| Date | 03/27/22 |
| Showtime | 2:30P |
| MPAA Rating | PG13 |
| Ticket Type | ADMat |
| Ticket Price | $10.00 |
| Auditorium | 9 |
| Row | N |
| Seat | 9 |
| Station | ST0-0-0 |
| Transaction # | 032722134856 |
| QR/Barcode | NA |

**Observations:**
- The Lost City (PG-13) released March 25, 2022. March 27 was a Sunday — opening weekend. Confirmed 2022.
- "ADMat" = Adult Matinee at $10.00 — the only adult-priced ticket in this batch. $1 more than Student/Senior.
- Row N, Seat 9 in Auditorium 9.
- Transaction date matches showtime: 03/27/22 in both.

---

#### Ticket 2: Uncharted (top center)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | UNCHARTED |
| Day | Mon |
| Date | 02/21/22 |
| Showtime | 2:00P |
| MPAA Rating | PG13 |
| Ticket Type | STMat |
| Ticket Price | $9.00 |
| Auditorium | 16 |
| Row | N |
| Seat | 12 |
| Station | ST0-0-0 |
| Transaction # | 022122033639 |
| QR/Barcode | NA |

**Observations:**
- Uncharted (PG-13) released February 18, 2022. February 21 was Presidents' Day Monday — opening weekend holiday. Confirmed 2022.
- "STMat" = Student Matinee at $9.00.
- Row N, Seat 12 in Auditorium 16 — the largest auditorium (16 = the venue's max screen number).
- Presidents' Day showing — consistent with the patron's pattern of attending on holidays/weekends.
- Transaction date matches: 02/21/22.

---

#### Ticket 3: Ambulance (top right)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | AMBULANCE |
| Day | Sun |
| Date | 04/24/22 |
| Showtime | 4:50P |
| MPAA Rating | R |
| Ticket Type | STEve |
| Ticket Price | $9.00 |
| Auditorium | 13 |
| Row | J |
| Seat | 8 |
| Station | ST0-0-0 |
| Transaction # | 042422163146 |
| QR/Barcode | NA |

**Observations:**
- Ambulance (R) released April 8, 2022. April 24 was a Sunday — third weekend. Confirmed 2022.
- "STEve" = Student Evening at $9.00 for a 4:50 PM showing — confirms the matinee/evening cutoff is before 4:50 PM.
- Row J, Seat 8 in Auditorium 13 — different seating area from the usual N-row preference. Row J is closer to the front.
- This is the only R-rated movie in the batch. The user's right-side observation: this ticket shows the RIGHT side (tear-off) is partially visible with an "R" and edge data.
- Transaction date matches: 04/24/22.

---

#### Ticket 4: Spider-Man: No Way Home (bottom left)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | SPIDERMAN NO WAY (truncated from "Spider-Man: No Way Home") |
| Day | Thu |
| Date | 12/16/21 |
| Showtime | 5:00P |
| MPAA Rating | PG13 |
| Ticket Type | SREve |
| Ticket Price | $9.00 |
| Auditorium | 15 |
| Row | N |
| Seat | 9 |
| Station | ST0-0-0 |
| Transaction # | 113021113750 |
| QR/Barcode | NA |

**Observations:**
- Spider-Man: No Way Home (PG-13) released December 17, 2021 (Friday). The ticket date is December 16, 2021 (Thursday) — **Thursday night preview**. Opening night eve. Confirmed 2021.
- **Title truncated**: "SPIDERMAN NO WAY" — drops "Home", removes hyphen from "Spider-Man", merges into "SPIDERMAN". 16 characters (at the POS limit).
- "SREve" = Senior Evening at $9.00 — only "Senior" ticket in this batch. Same $9.00 as Student. Different patron or different buyer (senior buying for themselves)?
- **Advance purchase**: Transaction # "113021113750" encodes 11/30/21 — purchased 16 days before the 12/16/21 showing. This is the only advance purchase in this batch (all others were same-day). Makes sense for the most anticipated movie of 2021.
- Row N, Seat 9 in Auditorium 15 — same N,9 as The Lost City (Aud 9). Patron's preferred seat coordinates.
- This is the earliest ticket in the batch (December 2021).

---

#### Ticket 5: Eternals (bottom center)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld L... (truncated at ticket edge) |
| Movie | ETERNALS |
| Day | (not clearly visible) |
| Date | 11/11/21 |
| Showtime | 7:00PM |
| MPAA Rating | PG13 |
| Ticket Type | STEve |
| Ticket Price | $9.00 |
| Auditorium | 7 |
| Row | 0 (likely Row O) |
| Seat | 14 |
| Station | ST0-0-0 |
| Transaction # | 111121153919 |
| QR/Barcode | NA |

**Observations:**
- Eternals (PG-13) released November 5, 2021. November 11, 2021 was Veterans Day (Thursday) — about one week after release. Confirmed 2021.
- "STEve" = Student Evening at $9.00.
- **Row 0, Seat 14 in Auditorium 7** — this is the SAME seat seen across multiple CW variants:
  - 2021: Eternals → Aud 7, 0,14 (this ticket)
  - 2022: Violent Night → Aud 8, Row=0, Seat=14 (cw-22 variant)
  - 2023: Equalizer 3 → Aud 8, 0,14 (20-24 variant)
  - 2023: The Marvels → Aud 7, 0,13 (20-24 variant)
  Patron's preferred spot confirmed across 3 years.
- Uses "7:00PM" (full "PM") instead of just "P" — inconsistent with other tickets in this batch. May be a font/space issue.
- The partially visible RIGHT side (tear-off) of this ticket is visible between Spider-Man and Eternals in the photo, showing "7:00P PG13" and "d Lincoln 16".
- Transaction date matches: 11/11/21.
- This is the EARLIEST ticket chronologically in the batch (November 2021).

## Right Side (Tear-Off) Observation

One ticket's RIGHT side is partially visible behind/between the Spider-Man and Eternals tickets. Visible data:
- "7:00P PG13" — matches Eternals showtime and rating
- "d Lincoln 16" — end of "Cinemaworld Lincoln 16"

This confirms the two-part ticket format: the RIGHT side contains a condensed duplicate of the LEFT side's data, consistent with the 20-24 variant's tear-off stubs. The RIGHT side may also show AM/PM more consistently (20-24 analysis noted "AM/PM only on tear-off").

## Patron Seating Pattern (All CW Variants Combined)

| Date | Movie | Aud | Row | Seat | Variant |
|---|---|---|---|---|---|
| May 2017 | King Arthur | 7 | — | — | pre-2020 |
| Jul 2017 | War for Planet of Apes | 8 | — | — | pre-2020 |
| Aug 2018 | Christopher Robin | 7 | — | — | pre-2020 |
| Nov 2018 | Creed II | 16 | O | 15 | 18-21 |
| Feb 2021 | The Marksman | 3 | L | 7 | 18-21 |
| Apr 2021 | Voyagers | 15 | N | 72 | 18-21 |
| Aug 2021 | Free Guy | 15 | N | 72 | 18-21 |
| **Nov 2021** | **Eternals** | **7** | **0/O** | **14** | **21-22** |
| **Dec 2021** | **Spider-Man NWH** | **15** | **N** | **9** | **21-22** |
| **Feb 2022** | **Uncharted** | **16** | **N** | **12** | **21-22** |
| **Mar 2022** | **The Lost City** | **9** | **N** | **9** | **21-22** |
| **Apr 2022** | **Ambulance** | **13** | **J** | **8** | **21-22** |
| Nov 2022 | Black Panther WF | 16 | N | 6 | 22 |
| Dec 2022 | Violent Night | 8 | 0/O | 14 | 22 |
| Sep 2023 | The Equalizer 3 | 8 | 0/O | 14 | 20-24 |
| Nov 2023 | The Marvels | 7 | 0/O | 13 | 20-24 |

**Patterns:**
- Row N is the dominant preference (9 of 13 seated tickets).
- Row 0/O, Seat 14 appears in Aud 7 and Aud 8 across 2021-2023.
- N,9 appears twice (Spider-Man in Aud 15, Lost City in Aud 9) — same coordinates, different auditoriums.
- Auditorium 7 appears 3 times across variants (Christopher Robin, Eternals, The Marvels).

## CW Variant Timeline (Updated)

| Variant | Era | Material | Seat Format | Title Suffix | Key Feature |
|---|---|---|---|---|---|
| Pre-2020 | 2017-2018 | Coca-Cola cardstock | None | Format prefix ("2D") | Severe truncation, no seats |
| 18-21 | 2018-2021 | Coca-Cola cardstock | Row-X, Seat-Y (dashes) | None | Added reserved seating |
| **21-22** | **2021-2022** | **Plain white paper** | **ROW,SEAT (comma)** | **None** | **Two-part ticket, "Auditorium" label** |
| 22 | 2022 | Coca-Cola cardstock | Row=X, Seat=Y (equals) | None | Same Coca-Cola stock, new separators |
| 20-24 | 2021-2024 | Plain white paper | ROW,SEAT (comma) | None | Tear-off stub, same as 21-22 |
| M | Unknown | Cardboard | Separate fields | None | "M" crown watermark |
| 26 | 2026 | Plain thin paper | Not shown | None | QR code, no price, "CW Theatres" |

> Note: The 21-22 and 20-24 variants appear to be the SAME physical ticket format spanning 2021-2024. They are documented separately because the sample images come from different date ranges, but the format is identical.

## Golden JSON

```json
[
  {
    "id": "cw-21-22-001",
    "image_path": "cw-lincoln-cinema/cw-21-22-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Plain paper two-part ticket (LEFT side shown). ADMat = Adult Matinee $10.00 — $1 more than Student/Senior. Same format as 20-24 variant, extends known range to 2021. Row N, Seat 9.",
    "expected": {
      "movie_title": "The Lost City",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2022-03-27T14:30:00",
      "seat_info": {
        "row": "N",
        "seat": "9"
      },
      "format": "Standard",
      "auditorium": "9",
      "ticket_price": {
        "amount": 10.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-21-22-002",
    "image_path": "cw-lincoln-cinema/cw-21-22-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Presidents' Day Monday showing. STMat = Student Matinee. Auditorium 16 (largest screen). Row N, Seat 12.",
    "expected": {
      "movie_title": "Uncharted",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2022-02-21T14:00:00",
      "seat_info": {
        "row": "N",
        "seat": "12"
      },
      "format": "Standard",
      "auditorium": "16",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-21-22-003",
    "image_path": "cw-lincoln-cinema/cw-21-22-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "STEve = Student Evening. 4:50 PM classified as 'Evening' — confirms matinee cutoff is before 4:50 PM. Row J (closer to front, unusual for this patron). Only R-rated film in batch.",
    "expected": {
      "movie_title": "Ambulance",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2022-04-24T16:50:00",
      "seat_info": {
        "row": "J",
        "seat": "8"
      },
      "format": "Standard",
      "auditorium": "13",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-21-22-004",
    "image_path": "cw-lincoln-cinema/cw-21-22-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Thursday night preview (12/16/21, movie released 12/17/21). Title truncated: 'SPIDERMAN NO WAY' = 'Spider-Man: No Way Home'. SREve = Senior Evening. ADVANCE PURCHASE: txn # encodes 11/30/21 (16 days before showtime). Row N, Seat 9.",
    "expected": {
      "movie_title": "Spider-Man: No Way Home",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2021-12-16T17:00:00",
      "seat_info": {
        "row": "N",
        "seat": "9"
      },
      "format": "Standard",
      "auditorium": "15",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-21-22-005",
    "image_path": "cw-lincoln-cinema/cw-21-22-5_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Veterans Day showing. STEve = Student Evening. Row 0, Seat 14 — same seat as Violent Night (2022) and Equalizer 3 (2023). Patron's preferred spot confirmed across 3 years. Earliest ticket in batch (Nov 2021). RIGHT side (tear-off) partially visible behind other tickets.",
    "expected": {
      "movie_title": "Eternals",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2021-11-11T19:00:00",
      "seat_info": {
        "row": "O",
        "seat": "14"
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
