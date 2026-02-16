# Rustic Tri-Vue Drive In — 2018 (Drive-In Double Feature Stub)

## Variant Overview
- **Chain**: Independent (Rustic Tri-Vue Drive In)
- **Location analyzed**: Rustic Tri-Vue Drive In, North Smithfield, RI (near Woonsocket/Smithfield border)
- **Ticket type**: Small thermal/cardstock stub with perforated/serrated top edge
- **Visual identifiers**: Plain off-white paper. No logos, watermarks, or branding graphics. Small, roughly square stub. Very minimal — fewer fields than any chain theater ticket.
- **Era**: 2018
- **Type**: Drive-in double feature — TWO movies on a single ticket

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Small, minimal stub — the simplest ticket format in the entire collection. No branding, no logos, no scannable codes. Text is printed in a single-column layout. The ticket appears rotated 90° in the photo. Fields reading the ticket in its intended orientation:

1. **Movie titles** — BOTH movies for the double feature on a single line, separated by a "/" slash (e.g. "ADRIFT/LIFE O"). The first title is the primary feature, the second is the late show. Second title may be truncated at the ticket edge.
2. **Date + Showtime** — "Mon DD H:MMp" (e.g. "Jun 2 8:40p"). Abbreviated month, day of month (NO day of week, NO year), 12-hour time with "p" for PM. No leading zero on day or hour.
3. **Screen number** — "Theatre #N" (e.g. "Theatre #2"). At a drive-in, this is the outdoor screen/field number, not an enclosed auditorium.
4. **Admission line items** — "1 Reg" appears, possibly twice. "1" = quantity, "Reg" = Regular (adult) admission. May represent one entry per movie or per person.
5. **Price** — "$XX.00" (e.g. "$27.00"). Appears to be the total for the ticket/car, not per-person.
6. **Theater name** — "Rustic Tri-Vue Drive In" printed along one edge. "Tri-Vue" = three screens (the drive-in has 3 outdoor fields).
7. **Transaction/store code** — numeric string (partially legible).
8. **Screen number repeat** — "2" at the bottom, confirming Theatre #2.

**No barcode, no QR code, no seat info, no MPAA rating, no day of week, no year.**

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

### Double Feature — Two Movies on One Ticket
- **This is the defining edge case.** A single ticket lists TWO movies separated by a "/" slash. This is standard for drive-ins: you pay once for a double feature.
- **"ADRIFT/LIFE O"** = Movie 1: "Adrift", Movie 2: "Life of the Party" (truncated to "LIFE O" at the ticket edge).
- **Movie 1 is the primary feature** — the reason the patron drove there. It plays first (at 8:40 PM while it gets dark). Movie 2 plays later (~10:30-11 PM). Some patrons leave after Movie 1.
- **Extraction challenge**: The current extraction schema expects one movie per ticket. This ticket requires either (a) extracting both movies and returning an array, or (b) extracting only the primary movie (first listed) and noting the second in metadata.
- **Recommendation**: Extract BOTH movies. Return the first as the primary entry and the second as a linked/secondary entry. The showtime (8:40p) belongs to Movie 1. Movie 2's showtime can be estimated (~2 hours after Movie 1) but is not printed.

### No Year on Date
- "Jun 2" has no year. Must infer from movie release dates.
- Adrift released June 1, 2018. June 2 is opening weekend Saturday. Confirmed **2018**.
- Life of the Party released May 11, 2018. Still in theaters in early June. Confirmed compatible.

### Drive-In Specific Considerations
- **No seat info**: Drive-ins have parking spots, not seats. `seat_info` should be `null`.
- **"Theatre #2" = outdoor screen**: Not an enclosed auditorium. The "Tri-Vue" (three-screen) drive-in has 3 fields. This is Field/Screen #2.
- **Showtime context**: 8:40 PM for a June showing in New England — the sun sets around 8:15-8:30 PM in early June in RI. The movie starts at dusk. This late showtime is a strong drive-in indicator for indoor/outdoor classification.
- **Pricing model**: Drive-ins often charge per CAR (not per person) for a double feature. "$27.00" for a double feature per car is consistent with 2018 New England drive-in pricing. Alternatively, it could be per-person pricing for 2+ admissions. The "1 Reg" entries may represent individual line items that sum to the total.
- **No MPAA rating**: Not printed on the ticket. Adrift is PG-13, Life of the Party is PG-13.

### Title Truncation
- "LIFE O" is cut off at the physical ticket edge (not character-limited by the POS system). The second movie title simply extends beyond the paper. This is different from POS truncation — it's physical truncation.
- The "/" separator is critical for identifying double features. Gemini must recognize "/" as a movie separator, not part of a title.

### Minimal Data
- This ticket has the LEAST amount of extractable data in the entire collection:
  - No MPAA rating
  - No year
  - No day of week
  - No seat info
  - No barcode/QR code
  - No chain identifier beyond the theater name
  - No ticket type abbreviation beyond "Reg"
- The confidence score should be lower due to the limited data and physical truncation.

## Implications for App Architecture

This ticket raises several questions about how the extraction pipeline should handle non-standard formats:

1. **Multi-movie extraction**: The schema needs to support returning multiple movies from a single ticket image. Options:
   - Return an array of movie objects (breaking change)
   - Return a primary movie + `secondary_movies` array
   - Return separate extraction results per movie, linked by a `ticket_id`

2. **Drive-in vs Indoor**: Could add a `venue_type` field ("indoor" | "drive-in") to help the UI represent the experience differently (no seat map, outdoor setting).

3. **Per-car pricing**: The `ticket_price` field currently assumes per-person. For drive-ins, it may be per-car covering 2+ people and 2 movies. Could add `pricing_model` ("per_person" | "per_car") or just note it in metadata.

4. **Second movie showtime**: Only the first movie's showtime is printed. The second movie's time could be estimated but shouldn't be fabricated. Could use `null` for the second movie's showtime.

## Raw Field Extraction

### rustic-drive-in-18-Adrift+Life_Of_The_Party.HEIC

> Note: Single ticket for a double feature. Rotated 90° CCW in the photo. Serrated/perforated top edge. Significant fading.

#### Ticket 1: Double Feature — Adrift / Life of the Party

| Field | Raw Value |
|---|---|
| Theater Name | Rustic Tri-Vue Drive In |
| Movie 1 (Primary) | ADRIFT |
| Movie 2 (Secondary) | LIFE O (truncated — "Life of the Party") |
| Separator | / (slash between titles) |
| MPAA Rating | NA (not printed) |
| Date | Jun 2 (no year) |
| Day | NA (not printed) |
| Showtime | 8:40p (PM) |
| Admission | 1 Reg (appears twice — possibly 1 per movie or 2 people) |
| Total Price | $27.00 |
| Screen | Theatre #2 (outdoor field) |
| Seat | NA (drive-in — no seats) |
| Barcode | NA |
| QR Code | NA |
| Transaction # | Partially legible (along right edge) |

**Observations:**
- **Double feature on one stub** — "ADRIFT/LIFE O" lists both movies separated by "/". First movie = primary feature (Adrift), second = late show (Life of the Party, truncated at ticket edge).
- Adrift (PG-13, STX Entertainment) released June 1, 2018. June 2 is opening weekend Saturday. Confirmed 2018.
- Life of the Party (PG-13, Warner Bros) released May 11, 2018. Three weeks into its theatrical run on June 2 — still playing, confirmed.
- 8:40 PM showtime makes sense for a drive-in in early June — sunset in North Smithfield, RI is approximately 8:15-8:25 PM on June 2. Movie starts around dusk.
- "Rustic Tri-Vue Drive In" — a real independent drive-in theater in North Smithfield, RI (near the Woonsocket/Smithfield border). "Tri-Vue" = 3 outdoor screens. One of the last remaining drive-ins in Rhode Island.
- "Theatre #2" = Screen/Field #2 of the 3 drive-in fields.
- "$27.00" — likely per-car pricing for the double feature. Per-person for an adult double feature in 2018 would more likely be $10-12.
- "1 Reg" listed twice — possibly one "Regular" admission entry per movie, or two people. If per-car, this might be 1 Regular car admission.
- Minimal ticket with the least data of any ticket in the collection. No rating, no year, no day, no seat, no scannable code.
- Ticket is significantly faded — 6+ years of aging on thin paper/thermal stock. All primary text remains legible but contrast is low.
- Serrated/perforated top edge suggests this was torn from a roll (like a carnival/raffle ticket style).

## Comparison: Drive-In vs Indoor Tickets

| Feature | Drive-In (Rustic) | Indoor Chains (AMC, Showcase, CW, Regal) |
|---|---|---|
| Movies per ticket | 2 (double feature) | 1 |
| Seat info | None (parking spots) | Row + Seat (when reserved) |
| Showtime context | After sunset (8-9 PM in summer) | Any time |
| Pricing model | Per car (~$27 for 2 movies) | Per person per movie |
| MPAA rating | Not printed | Usually printed |
| Year on date | Not printed | Usually printed (2 or 4 digit) |
| Chain branding | Minimal (just theater name) | Watermarks, logos, codes |
| Scannable code | None | Barcode or QR |
| Ticket size | Minimal stub | Standard receipt or cardstock |

## Golden JSON

```json
[
  {
    "id": "rustic-18-001",
    "image_path": "rustic-drive-in/rustic-drive-in-18-Adrift+Life_Of_The_Party.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Drive-in double feature. Primary movie 'ADRIFT' listed first. 'LIFE O' truncated at ticket edge = 'Life of the Party'. Year inferred from Adrift release (June 1, 2018). $27.00 likely per-car. Theatre #2 = outdoor screen/field. Minimal data — no rating, no year, no seats, no scannable code.",
    "expected": {
      "movie_title": "Adrift",
      "theater_chain": null,
      "theater_name": "Rustic Tri-Vue Drive In",
      "theater_location": "North Smithfield, RI",
      "showtime": "2018-06-02T20:40:00",
      "seat_info": null,
      "format": "Drive-In",
      "auditorium": "2",
      "ticket_price": {
        "amount": 27.00,
        "currency": "USD"
      },
      "confidence_score": 0.70
    }
  },
  {
    "id": "rustic-18-002",
    "image_path": "rustic-drive-in/rustic-drive-in-18-Adrift+Life_Of_The_Party.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Second movie of the double feature. Title truncated at ticket edge: 'LIFE O' = 'Life of the Party'. Showtime not printed (plays after Adrift, estimated ~10:30 PM). Same ticket as rustic-18-001. Price shared with primary feature ($27 covers both movies).",
    "expected": {
      "movie_title": "Life of the Party",
      "theater_chain": null,
      "theater_name": "Rustic Tri-Vue Drive In",
      "theater_location": "North Smithfield, RI",
      "showtime": null,
      "seat_info": null,
      "format": "Drive-In",
      "auditorium": "2",
      "ticket_price": null,
      "confidence_score": 0.60
    }
  }
]
```
