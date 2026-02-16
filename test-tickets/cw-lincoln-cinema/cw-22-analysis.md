# CW Theatres — "22" Variant (Cinemaworld Coca-Cola Branded, Equals-Sign Seats)

## Variant Overview
- **Chain**: Cinemaworld (pre-rebrand to CW Theatres)
- **Location analyzed**: Cinemaworld Lincoln 16, Lincoln, RI
- **Ticket type**: Physical cardstock ticket with Coca-Cola partnership branding (same stock as pre-2020 and 18-21 variants)
- **Visual identifiers**: Same light blue/pink Coca-Cola circle design, large bold auditorium number, "THEATRES" text in circle area. Identical to 18-21 stock.
- **Era**: 2022 (bridges the 18-21 Coca-Cola variant and the 20-24 plain paper variant)
- **Website**: www.cwtheatres.com (current)

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Same small-format Coca-Cola branded cardstock as the pre-2020 and 18-21 variants — light blue background, pink/coral circle with branding, large bold auditorium number. Layout is nearly identical to the 18-21 variant, with one key difference: the seat format changed from dashes to equals signs. Fields (reading the ticket in normal orientation):

1. **Theater name** — "Cinemaworld Lincoln 16" along one edge.
2. **Movie title** — ALL CAPS, may be truncated for long titles (e.g. "BLACK PANTHER W" for "Black Panther: Wakanda Forever"). Same aggressive truncation as pre-2020 and 18-21 variants.
3. **MPAA rating** — near the auditorium circle (e.g. "PG13", "R").
4. **Day + Date** — abbreviated day + "Month Day" with NO year (e.g. "Sun Nov 13", "Sun Dec 11").
5. **Showtime** — HH:MM AM/PM (e.g. "11:30 AM", "11:40 AM").
6. **Ticket type + Price** — abbreviated type + dollar amount (e.g. "MIMat $9.00", "STMat $9.00"). Space between type and "$".
7. **Transaction number** — long numeric string encoding the date (e.g. "00052-84111322112037" with MMDDYY embedded).
8. **Row + Seat** — "Row=X, Seat=Y" format with explicit labels and **equals-sign separators** (e.g. "Row=N, Seat=6", "Row=0, Seat=14"). **This is the key difference from the 18-21 variant which used dashes.**
9. **Auditorium number** — large bold digit in the pink circle design.
10. **No barcode or QR code**.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Equals signs, not dashes**: The 18-21 variant used "Row-X, Seat-Y" with dashes. This 2022 variant uses "Row=X, Seat=Y" with equals signs. Same data, different separator. Likely a POS software update on the same ticket stock.
- **"MIMat" = Military Matinee**: New ticket type abbreviation not seen in 18-21. Military pricing at $9.00 — same as Student and Senior matinee pricing. Abbreviation pattern: "MI" = Military, "Mat" = Matinee.
- **Row "0" vs "O"**: "Row=0, Seat=14" — the "0" could be Row O (letter O) or Row 0 (numeric). Same ambiguity as the 20-24 variant's "0,14". The patron appears to sit in this same row across 2022 (this ticket) and 2023 (20-24 variant tickets), suggesting it's a consistent notation for the same physical row.
- **Title truncation**: Same aggressive truncation as previous Coca-Cola variants. "BLACK PANTHER W" = "Black Panther: Wakanda Forever" — subtitle cut after first word. "VIOLENT NIGHT" fits completely (short title).
- **No year on date**: Same as all Coca-Cola variants — only "Day Month Day-of-month" shown. Year inferred from movie release dates.
- **Transaction number encodes date + year**: Same pattern as pre-2020 and 18-21. The MMDDYY is embedded starting around position 7 of the number after the dash. E.g. "00052-84**111322**..." = 11/13/22 = November 13, 2022.
- **Same physical ticket stock**: Visually indistinguishable from 18-21 variant. The only way to differentiate is the equals-sign seat format (vs dashes) and the presence of "MIMat" as a ticket type.
- **Duplicate ticket in photo**: The Black Panther ticket appears twice — once flat and once rotated 90° CCW to show the seat info area. This is the same physical ticket, not two separate tickets.
- **Same Coca-Cola design as 2017-2021**: This confirms the Coca-Cola branded ticket stock was in use for at least 5+ years (2017-2022).

## Differences from Other Coca-Cola Variants

| Feature | Pre-2020 (No Seats) | 18-21 (Dash Seats) | 22 (Equals Seats) |
|---|---|---|---|
| Seat info | Not shown | "Row-X, Seat-Y" (dashes) | "Row=X, Seat=Y" (equals) |
| Ticket types | AdEve only (in samples) | STEve, STMat, ADMat | MIMat, STMat |
| Price range | $10.00 (2017-2018) | $8.00-$10.00 (2018-2021) | $9.00 (2022) |
| Era | 2017-2018 | 2018-2021 | 2022 |
| Reserved seating | No | Yes | Yes |
| Separator | N/A | Dash (-) | Equals (=) |

## Raw Field Extraction

### cw-22-Black_Panther_Wakanda+Violent_Night.HEIC

> Note: This single image contains THREE ticket images, but two are the same Black Panther ticket (one flat, one rotated). Two UNIQUE tickets total.

#### Ticket 1: Black Panther: Wakanda Forever (top right + left rotated)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | BLACK PANTHER W (truncated from "Black Panther: Wakanda Forever") |
| MPAA Rating | PG13 |
| Day | Sun |
| Date | Nov 13 |
| Showtime | 11:30 AM |
| Ticket Type | MIMat |
| Ticket Price | $9.00 |
| Row | N |
| Seat | 6 |
| Auditorium | 16 |
| Transaction # | 00052-84111322112037 |
| QR/Barcode | NA |

**Observations:**
- Black Panther: Wakanda Forever (PG-13) released November 11, 2022. November 13 was a Sunday in 2022 — opening weekend, confirmed **2022**.
- Title truncated: "BLACK PANTHER W" — the full subtitle "akanda Forever" is cut off. Only the "W" from "Wakanda" fits.
- "MIMat" = Military Matinee — a new ticket type not seen in the 18-21 samples. Military discount pricing at $9.00 (same as Student/Senior matinee).
- Transaction number: "00052-84**111322**..." = 11/13/22 = November 13, 2022. Year confirmed.
- Row N, Seat 6 in Theatre 16 — a large auditorium. Different seat area than the N-72 preferred spot in Theatre 15 (seen in 18-21 tickets).
- The rotated ticket (left) shows the same data from a different angle, revealing the "Row=N, Seat=6" text that's partially obscured on the flat version.
- 11:30 AM matinee on opening weekend.

---

#### Ticket 2: Violent Night (bottom center)

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Movie | VIOLENT NIGHT |
| MPAA Rating | R |
| Day | Sun |
| Date | Dec 11 |
| Showtime | 11:40 AM |
| Ticket Type | STMat |
| Ticket Price | $9.00 |
| Row | 0 (likely Row O) |
| Seat | 14 |
| Auditorium | 8 |
| Transaction # | 00022-85121122114242 |
| QR/Barcode | NA |

**Observations:**
- Violent Night (R) released December 2, 2022. December 11 was a Sunday in 2022 — second weekend, confirmed **2022**.
- Title fits completely — "VIOLENT NIGHT" is short enough to not be truncated.
- "STMat" = Student Matinee — same abbreviation as the 18-21 variant at the same $9.00 price.
- Transaction number: "00022-85**121122**..." = 12/11/22 = December 11, 2022. Year confirmed.
- Row=0, Seat=14 in Theatre 8. The "0" matches the "0,14" seen in the 20-24 variant's Equalizer 3 ticket (same Seat 14 in Theatre 8). This is almost certainly the same physical row — confirming the patron has a preferred spot: Row O/0, Seat 13-14 in Theatre 7/8.
- Both tickets are Sunday morning matinees (11:30 AM and 11:40 AM) — consistent with a weekend matinee pattern seen across all this patron's tickets.

## Patron Pattern (Cross-Variant)

This image, combined with data from 18-21 and 20-24 variants, reveals a clear patron preference pattern:

| Date | Movie | Theatre | Row | Seat | Variant |
|---|---|---|---|---|---|
| Nov 2018 | Creed II | 16 | O | 15 | 18-21 (dash) |
| Feb 2021 | The Marksman | 3 | L | 7 | 18-21 (dash) |
| Apr 2021 | Voyagers | 15 | N | 72 | 18-21 (dash) |
| Aug 2021 | Free Guy | 15 | N | 72 | 18-21 (dash) |
| Nov 2022 | Black Panther W.F. | 16 | N | 6 | 22 (equals) |
| Dec 2022 | Violent Night | 8 | 0/O | 14 | 22 (equals) |
| Sep 2023 | The Equalizer 3 | 8 | 0/O | 14 | 20-24 (comma) |
| Nov 2023 | The Marvels | 7 | 0/O | 13 | 20-24 (comma) |

- Same-row seating (Row N/O/0) across 5 years of visits.
- Seat 13-14 is a consistent preference when not in Theatre 15.
- Sunday/Monday matinees are the most common showtime pattern.

## Golden JSON

```json
[
  {
    "id": "cw-22-001",
    "image_path": "cw-lincoln-cinema/cw-22-Black_Panther_Wakanda+Violent_Night.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Coca-Cola branded with equals-sign seat format. MIMat = Military Matinee (new type). 'BLACK PANTHER W' truncated from 'Black Panther: Wakanda Forever'. Same ticket appears twice in photo (flat + rotated). Txn # confirms 11/13/22.",
    "expected": {
      "movie_title": "Black Panther: Wakanda Forever",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2022-11-13T11:30:00",
      "seat_info": {
        "row": "N",
        "seat": "6"
      },
      "format": "Standard",
      "auditorium": "16",
      "ticket_price": {
        "amount": 9.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "cw-22-002",
    "image_path": "cw-lincoln-cinema/cw-22-Black_Panther_Wakanda+Violent_Night.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Coca-Cola branded with equals-sign seat format. STMat = Student Matinee. Row '0' likely Row O (matches 20-24 variant's '0,14' in same Theatre 8). Same patron preferred spot. Txn # confirms 12/11/22.",
    "expected": {
      "movie_title": "Violent Night",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2022-12-11T11:40:00",
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
      "confidence_score": 0.85
    }
  }
]
```
