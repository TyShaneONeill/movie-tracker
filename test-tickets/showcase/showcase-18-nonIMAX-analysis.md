# Showcase Cinemas — 2018 Non-IMAX (Vertical Thermal Receipt, Pre-GAR)

## Variant Overview
- **Chain**: Showcase Cinemas (National Amusements)
- **Locations analyzed**: Showcase Cinemas Seekonk 10 (Seekonk, MA), Showcase Cinema de Lux Providence (Providence, RI), Showcase Cinemas Warwick Mall (Warwick, RI)
- **Ticket type**: Tall vertical thermal receipt — the PREDECESSOR to the 21-22 format
- **Visual identifiers**: "MOVIE TICKET" bold header at top. Diagonal "SHOWCASE" watermark repeating across ticket (NOT "SHOWCASE CINEMA DE LUX" — just "SHOWCASE"). 1D barcode at bottom (NOT QR code). Same basic layout as 21-22 but without reserved seating.
- **Era**: 2018
- **Website**: www.showcasecinemas.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Tall, narrow vertical ticket (portrait orientation) — nearly identical layout to the 2021-22 variant. Same "MOVIE TICKET" header, same field ordering, same thermal paper. This is clearly the direct ancestor of the 21-22 format. Layout top-to-bottom:

1. **"MOVIE TICKET"** — bold header at top, all caps. Same as 21-22.
2. **Movie title** — mixed case, may be truncated for long titles (e.g. "Ready Pla" for "Ready Player One"). NO "-CCDV" suffix (unlike the 2017 Seekonk stubs).
3. **MPAA rating + Date** — single line: "RATING MM/DD/YYYY" (e.g. "R 05/17/2018", "PG-13 07/22/2018"). **Full 4-digit year**. Note: 2018 uses "PG-13" with hyphen while some 21-22 samples show "PG-13" the same way.
4. **Day + Showtime** — single line: "Day HH:MM pm" (e.g. "Thur 07:15 pm", "Sun 04:40 pm"). 12-hour format. Note: uses "Thur" (4 letters) for Thursday, not "Thu" (3 letters) as in 21-22.
5. **"GA"** — General Admission. NOT "GAR" (General Admission Reserved) — this 2018 variant has NO reserved seating. "GA" means open seating.
6. **Theatre number** — "Theatre N" in large font (e.g. "Theatre 8", "Theatre 9", "Theatre 5"). Same format as 21-22.
7. **Price** — "$XX.XX" (e.g. "$12.50", "$9.75", "$12.25"). Always includes "$" symbol.
8. *(gap/whitespace)*
9. **Payment info** — "TYPE - XXXXX - StoreTerminal" (e.g. "CSH - 3910 - 338BOX03", "Cred - 4032 - 428BOX04"). Payment type + reference number + store code + terminal.
10. **Location name** — theater location (e.g. "Seekonk 10", "Providence", "Warwick Mall").
11. **Date + Time of sale** — "MM/DD/YYYY HH:MM pm" (e.g. "05/17/2018 07:11 pm"). PURCHASE timestamp.
12. **Ticket number** — "Ticket: XXXXXXXX/NNN" (e.g. "Ticket: 00119193/002"). Same format as 21-22.
13. **1D Barcode** — traditional barcode with ticket number printed below in asterisks (e.g. "*00426178/001*").

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **"GA" NOT "GAR"**: This 2018 variant uses "GA" (General Admission) — NO reserved seats. The 21-22 variant changed to "GAR" (General Admission Reserved) when reserved seating was added. Do NOT expect seat info on 2018 tickets.
- **"SHOWCASE" watermark (not "SHOWCASE CINEMA DE LUX")**: The diagonal watermark reads only "SHOWCASE" — the "CINEMA DE LUX" suffix was added later (visible in 21-22 and 24 variants). This is a useful era indicator.
- **Title truncation still occurs**: "Ready Pla" = "Ready Player One" (truncated to ~9 characters). However, more space is available than the 2017 stubs (~7 chars). "Deadpool 2" (10 chars) and "Skyscraper" (10 chars) fit without truncation.
- **No "-CCDV" suffix**: Unlike the 2017 Seekonk stubs which appended "-CCDV" to every title, the 2018 thermal receipt format has NO accessibility suffix. The titles are clean.
- **"CSH" = Cash payment**: New payment type not seen in later variants. "CSH - 3910" indicates cash payment with a reference number. Compare to "Cred" (credit card) in 2018 and 21-22, and "Mobi" (mobile) in 24.
- **"Thur" vs "Thu"**: 2018 uses 4-letter "Thur" for Thursday, while 21-22 may use 3-letter abbreviations. Minor but useful for era detection.
- **1D barcode, NOT QR code**: Same as the 2017 stubs. QR codes appear starting in the 21-22 era. The switch from barcode to QR happened between 2018 and 2021.
- **Barcode text includes ticket number**: The number under the barcode (e.g. "*00426178/001*") matches the "Ticket:" field above. The asterisks are barcode framing characters.
- **Three locations, one chain**: This image shows tickets from 3 different Showcase locations (Seekonk, Providence, Warwick Mall) — all with identical format, confirming this is a chain-wide standard.
- **Store codes identify locations**: 338 = Seekonk, 428 = Providence (same as 2022!), 392 = Warwick Mall. These codes persist across years.
- **Thursday night preview**: Deadpool 2 tickets are dated 05/17/2018 (Thursday) — the movie's wide release was May 18. This is a Thursday night preview screening. The showtime (7:15 PM) is consistent with preview timing.
- **Location name format changed**: "Seekonk 10" (2018) vs "Seekonk Route 6" (2017 stubs). Same physical theater — the naming convention changed from road name to screen count when the ticket format was updated.
- **Group purchase**: Two Deadpool 2 tickets with consecutive numbers (/001 and /002) confirm a group purchase. Same transaction, same terminal, same timestamp.
- **All terminals are BOX (box office)**: "338BOX03", "428BOX04", "392BOX04" — all box office, no kiosks. Kiosks appear in later years ("KIOSK04" in 2022 Providence).

## Showcase Format Evolution (Complete Timeline)

| Year | Variant | Form Factor | Chain Text | Seat Info | Category | Code Type | Title Suffix |
|---|---|---|---|---|---|---|---|
| 2017 | IMAX Stub | Small square cardstock | None | None | "SE" | QR code | "IMAX" appended |
| 2017 | Non-IMAX Stub | Small portrait cardstock | "SHOWCASE" block text | None | "GA" | 1D barcode | "-CCDV" appended |
| 2018 | Thermal Receipt | Tall vertical thermal | "SHOWCASE" watermark | None | "GA" | 1D barcode | None |
| 2021-22 | Thermal Receipt | Tall vertical thermal | "SHOWCASE CINEMA DE LUX" watermark | "SEAT L25" | "GAR" | QR code | None |
| 2024 | Thermal Receipt | Wide horizontal thermal | "SHOWCASE CINEMA DE LUX" watermark | "SEAT K31" | Descriptive ("SENIORR") | QR code | None |

**Key transitions:**
- 2017→2018: Cardstock stubs → thermal receipts, "-CCDV" suffix dropped, "SHOWCASE" moved from block text to watermark
- 2018→2021: "SHOWCASE" → "SHOWCASE CINEMA DE LUX", GA → GAR (reserved seating added), barcode → QR code, kiosks introduced
- 2021→2024: Portrait → landscape layout, "MOVIE TICKET" header dropped, "GAR" → descriptive types, "Cred" → "Mobi"

## Raw Field Extraction

### showcase-18-nonIMAX-3_Movies.HEIC

> Note: This single image contains FOUR tickets from three Showcase locations. Two tickets are for the same Deadpool 2 showing (group purchase). Three UNIQUE movies. Coin visible for scale.

#### Ticket 1: Deadpool 2 — Seekonk (far left + far right)

> Two tickets visible: /002 (far left) and /001 (far right). Same showing, same purchase. Data extracted once.

| Field | Raw Value |
|---|---|
| Header | MOVIE TICKET |
| Movie | Deadpool 2 |
| MPAA Rating | R |
| Date | 05/17/2018 |
| Day | Thur |
| Showtime | 07:15 pm |
| Category | GA |
| Theatre (Auditorium) | 8 |
| Price | $12.50 |
| Payment | CSH - 3910 - 338BOX03 |
| Location | Seekonk 10 |
| Date/Time of Sale | 05/17/2018 07:11 pm |
| Ticket # (left) | 00119193/002 |
| Ticket # (right) | 00119193/001 |
| Barcode | Yes (1D) |
| QR Code | NA |

**Observations:**
- Deadpool 2 (R) released May 18, 2018 (Friday). The ticket date is May 17, 2018 (Thursday) — this is a **Thursday night preview screening**. Opening night, the evening before wide release. Confirmed.
- **Two tickets for the same showing** — /001 and /002 from the same transaction. Group purchase of 2 tickets. Identical in every field except ticket number.
- "CSH - 3910" = **Cash payment** — the only cash payment in the entire Showcase collection. "3910" is a reference number (not a credit card). This is notable because all later Showcase tickets show "Cred" or "Mobi".
- "338BOX03" = Store 338 (Seekonk), Box Office terminal 03. All box office in this era — no kiosks yet.
- "Seekonk 10" — same physical location as the 2017 "Seekonk Route 6" stubs. Naming convention changed from road name to screen count.
- Time of sale 07:11 pm, showtime 07:15 pm — 4 minutes before.
- $12.50 Thursday evening pricing. Same as Seekonk 2017 evening ($12.50 for Guardians 2).

---

#### Ticket 2: Skyscraper — Providence (center left)

| Field | Raw Value |
|---|---|
| Header | MOVIE TICKET |
| Movie | Skyscraper |
| MPAA Rating | PG-13 |
| Date | 07/22/2018 |
| Day | Sun |
| Showtime | 04:40 pm |
| Category | GA |
| Theatre (Auditorium) | 9 |
| Price | $9.75 |
| Payment | Cred - 4032 - 428BOX04 |
| Location | Providence |
| Date/Time of Sale | 07/22/2018 04:29 pm |
| Ticket # | 00426178/001 |
| Barcode | Yes (1D) |
| QR Code | NA |

**Observations:**
- Skyscraper (PG-13) released July 13, 2018. July 22, 2018 (Sunday) is second weekend. Confirmed.
- Title fits completely — "Skyscraper" is exactly 10 characters.
- "Cred - 4032 - 428BOX04" — Credit card ending 4032, store 428 (Providence), Box Office 04. **Store 428 is the same Providence location as the 2022 Batman ticket** (which used 428KIOSK04). Same store, different terminal evolution (BOX → KIOSK).
- $9.75 Sunday afternoon pricing — same price as Seekonk 2017 Saturday afternoon (Get Out). Afternoon pricing is consistent across locations.
- Time of sale 04:29 pm, showtime 04:40 pm — 11 minutes before.
- Theatre 9 at Providence.

---

#### Ticket 3: Ready Player One — Warwick Mall (center right)

| Field | Raw Value |
|---|---|
| Header | MOVIE TICKET |
| Movie | Ready Pla (truncated from "Ready Player One") |
| MPAA Rating | PG-13 |
| Date | 04/19/2018 |
| Day | Thur |
| Showtime | 06:15 pm |
| Category | GA |
| Theatre (Auditorium) | 5 |
| Price | $12.25 |
| Payment | Cred - 8869 - 392BOX04 |
| Location | Warwick Mall |
| Date/Time of Sale | 04/19/2018 06:00 pm |
| Ticket # | 00177735/002 |
| Barcode | Yes (1D) |
| QR Code | NA |

**Observations:**
- Ready Player One (PG-13) released March 29, 2018. April 19, 2018 (Thursday) is about 3 weeks after release. Confirmed.
- **Title truncated**: "Ready Pla" — "Ready Player One" (16 chars) cut to 9 characters. The "yer One" portion is lost. This is POS truncation (not physical edge damage).
- "Cred - 8869 - 392BOX04" — Credit card ending 8869, store 392 (Warwick Mall), Box Office 04. **Third unique location** in this image.
- $12.25 Thursday evening pricing — slightly cheaper than Seekonk ($12.50) but still evening tier. Location-based pricing variation.
- Time of sale 06:00 pm, showtime 06:15 pm — 15 minutes before.
- Ticket #/002 — second ticket in a group purchase.
- "Warwick Mall" = Showcase Cinemas at Warwick Mall, Warwick, RI.

## Pricing Comparison (Showcase 2017-2018)

| Location | Year | Day | Time | Price | Tier |
|---|---|---|---|---|---|
| Seekonk | 2017 | Sat | 5:10pm | $9.75 | Afternoon |
| Seekonk | 2017 | Wed | 7:00pm | $12.50 | Evening |
| Seekonk | 2018 | Thur | 7:15pm | $12.50 | Evening |
| Providence | 2018 | Sun | 4:40pm | $9.75 | Afternoon |
| Warwick | 2018 | Thur | 6:15pm | $12.25 | Evening |
| Providence (IMAX) | 2017 | Sat | 11:30am | ~$19.25 | IMAX |

- **Afternoon: $9.75** — consistent across locations and years (2017-2018).
- **Evening: $12.25-$12.50** — slight variation by location. Seekonk is $0.25 more than Warwick.
- **IMAX: ~$19.25** — nearly double evening standard pricing.
- **Prices unchanged 2017→2018** — no inflation in this one-year period.

## Payment Method Evolution (Showcase)

| Year | Type | Code | Example |
|---|---|---|---|
| 2018 | Cash | CSH | CSH - 3910 - 338BOX03 |
| 2018 | Credit Card | Cred | Cred - 4032 - 428BOX04 |
| 2021-22 | Credit Card | Cred | Cred - 32751 - 428KIOSK04 |
| 2024 | Mobile Payment | Mobi | Mobi - 32759 - 428KIOS |

## Store Code Directory (Showcase)

| Store # | Location | First Seen | Last Seen |
|---|---|---|---|
| 338 | Seekonk 10, Seekonk, MA | 2018 | 2018 |
| 392 | Warwick Mall, Warwick, RI | 2018 | 2018 |
| 428 | Providence, Providence, RI | 2018 | 2024 |
| 444 | Attleboro 12, Attleboro, MA | 2021 | 2021 |

## Golden JSON

```json
[
  {
    "id": "showcase-18-001",
    "image_path": "showcase/showcase-18-nonIMAX-3_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Seekonk 2018. Thursday night preview (May 17, movie released May 18). Two tickets in image (/001 + /002 group purchase). CSH = Cash payment (only cash ticket in Showcase collection). 'SHOWCASE' watermark (not 'CINEMA DE LUX' yet). GA = General Admission, no reserved seats. Store 338 = Seekonk.",
    "expected": {
      "movie_title": "Deadpool 2",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinemas Seekonk",
      "theater_location": "Seekonk, MA",
      "showtime": "2018-05-17T19:15:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "8",
      "ticket_price": {
        "amount": 12.50,
        "currency": "USD"
      },
      "confidence_score": 0.95
    }
  },
  {
    "id": "showcase-18-002",
    "image_path": "showcase/showcase-18-nonIMAX-3_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Providence 2018. Store 428 = same Providence location as 2022 Batman ticket. Terminal evolved: BOX04 (2018) → KIOSK04 (2022). Sunday afternoon pricing $9.75. 'SHOWCASE' watermark era.",
    "expected": {
      "movie_title": "Skyscraper",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinema de Lux Providence",
      "theater_location": "Providence, RI",
      "showtime": "2018-07-22T16:40:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "9",
      "ticket_price": {
        "amount": 9.75,
        "currency": "USD"
      },
      "confidence_score": 0.95
    }
  },
  {
    "id": "showcase-18-003",
    "image_path": "showcase/showcase-18-nonIMAX-3_Movies.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Warwick Mall 2018. Third unique location in one image. 'Ready Pla' truncated from 'Ready Player One'. Evening pricing $12.25 ($0.25 less than Seekonk). Store 392 = Warwick. Ticket /002 = group purchase.",
    "expected": {
      "movie_title": "Ready Player One",
      "theater_chain": "Showcase Cinemas",
      "theater_name": "Showcase Cinemas Warwick",
      "theater_location": "Warwick, RI",
      "showtime": "2018-04-19T18:15:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "5",
      "ticket_price": {
        "amount": 12.25,
        "currency": "USD"
      },
      "confidence_score": 0.90
    }
  }
]
```
