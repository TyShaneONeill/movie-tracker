# CW Theatres — "Pre-2020" Variant (Cinemaworld Coca-Cola Branded)

## Variant Overview
- **Chain**: Cinemaworld (pre-rebrand to CW Theatres)
- **Location analyzed**: Cinemaworld Lincoln 16, Lincoln, RI
- **Ticket type**: Physical cardstock ticket with Coca-Cola partnership branding
- **Visual identifiers**: Light blue background, large pink/coral circle design element, bold auditorium number, "THEATRES" / "CINEMAS" text around circle. Coca-Cola branded ticket stock.
- **Era**: Pre-2020 (samples from 2017-2018)
- **Website**: www.cwtheatres.com (current)

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Small-format cardstock ticket on light blue Coca-Cola branded paper. Compact layout with a prominent graphic design element: a large pink/coral circle containing branding text and the auditorium number printed in large bold font. Ticket is wider than tall. Fields are printed in a mix of orientations. Reading the main text area top-to-bottom:

1. **Theater name** — "Cinemaworld Lincoln 16" printed along one edge (vertical or at top).
2. **Format prefix + Movie title** — ALL CAPS. Format (e.g. "2D") precedes the title. Titles are **heavily truncated** to fit the small ticket — only the first ~15-20 characters fit (e.g. "2D WAR PLANET O" for "War for the Planet of the Apes", "CHRISTOPHER ROB" for "Christopher Robin").
3. **Day + Date** — abbreviated day of week + "Month Day" with NO year (e.g. "Wed Aug 15", "Thu Jul 13", "Sun May 14").
4. **Time** — HH:MM AM/PM format (e.g. "6:45 PM", "10:15 PM", "4:30 PM").
5. **Ticket type + Price** — abbreviated type and dollar amount (e.g. "AdEve $10.00").
6. **MPAA rating** — printed near the design area (e.g. "PG", "PG13", "R").
7. **Auditorium number** — large bold digit integrated into the pink circle design (e.g. "7", "8").
8. **Transaction number** — long numeric string at bottom (e.g. "00796-308151818S5015"). Encodes the date: positions 7-12 contain MMDDYY.
9. **No barcode or QR code**.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Severe title truncation**: Titles are cut off aggressively to fit the small ticket width. "2D WAR PLANET O" = "War for the Planet of the Apes", "CHRISTOPHER ROB" = "Christopher Robin", "2D KING ARTHUR" = "King Arthur: Legend of the Sword". Gemini must infer the full movie title from the truncated text. This is the #1 extraction challenge for this variant.
- **No year on date**: Only "Day Month Day-of-month" is shown (e.g. "Thu Jul 13"). Year must be inferred from the movie's theatrical release window.
- **Transaction number encodes date + year**: The long number at the bottom contains MMDDYY starting around position 7. E.g. "00796-3**081518**185015" → 08/15/18 = August 15, 2018. This can be used to confirm or infer the year.
- **Format prefix in title**: "2D" appears BEFORE the movie title for movies that also had a 3D release. Movies without a 3D option (like Christopher Robin) have no prefix. Strip the format prefix from the title and put it in the format field.
- **"AdEve" = Adult Evening**: Consistent ticket type across all samples. May also see "AdMat" (Adult Matinee), "SRMat" (Senior Matinee), "STMat" (Student Matinee) based on other variants.
- **Theater name is "Cinemaworld"**: Pre-rebrand. Map `theater_chain` to "CW Theatres" (current) but `theater_name` should be "Cinemaworld Lincoln 16" as printed.
- **Coca-Cola branding is NOT content**: The large pink circle, "THEATRES"/"CINEMAS" text, and any Coca-Cola logos are decorative design elements, NOT movie/ticket data. Do not extract them.
- **Rotated/angled text**: Some text runs vertically along edges (especially theater name). OCR must handle multiple orientations.
- **Multiple tickets per image**: Photos may show several tickets together. Extract each as a separate entry.

## Differences from Other Variants

| Feature | "Pre-2020" (Coca-Cola) | "M" (Cardboard) | "20-24" (Cinemaworld) | "26" (CW Thin Paper) |
|---|---|---|---|---|
| Material | Branded cardstock (blue) | Plain cardboard (black/white/gold) | Plain thin paper + tear-off | Plain thin paper |
| Theater name | Cinemaworld Lincoln 16 | CW Theatres | Cinemaworld Lincoln 16 | Not printed |
| Branding | Coca-Cola circle design | "M" crown watermark | None | None |
| Title case | ALL CAPS, truncated | Mixed case | ALL CAPS | Mixed case |
| Title length | Severely truncated (~15-20 chars) | Full title | Full title | Full title (wraps) |
| Format prefix | "2D" before title | Not shown | Not shown | Not shown |
| Price | Shown ($10.00) | Shown ($9.00) | Shown ($9.00) | Not shown |
| Seat/Row | Not visible | Separate fields | Comma format (0,14) | Not shown |
| Rating | Shown | Shown | Shown | Not shown |
| Ticket type | Abbreviated (AdEve) | Abbreviated (SRMat) | Abbreviated (STMat, SRMat) | Full word (Senior) |
| Date format | "Day Mon DD" (no year) | MM/DD/YYYY (partial year) | MM/DD/YY (2-digit year) | "Month Day" (no year) |
| Year in txn # | Yes (MMDDYY encoded) | Not encoded | Date-prefixed | N/A |
| Scannable code | None | None | None | QR code |
| End time | Not shown | Not shown | Not shown | Shown |
| Ticket size | Small/compact | Medium | Standard | Standard |

## Raw Field Extraction

### cw-pre-2020-King_Arthur+Christopher_Rob+War_Planet.HEIC

> Note: This single image contains THREE tickets.

#### Ticket 1: Christopher Robin (top left)

**Fields extracted:**

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Format | (none — no 2D/3D prefix) |
| Movie | CHRISTOPHER ROB (truncated from "Christopher Robin") |
| Day | Wed |
| Date | Aug 15 |
| Showtime | 6:45 PM |
| Ticket Type | AdEve |
| Ticket Price | $10.00 |
| MPAA Rating | PG |
| Auditorium | 7 |
| Seat/Row | NA (not visible) |
| Transaction # | 00796-308151818S5015 |
| Barcode | NA |
| QR Code | NA |

**Observations:**
- Title truncated by 2 characters: "CHRISTOPHER ROB" → "Christopher Robin".
- No "2D" prefix — Christopher Robin (2018) was not released in 3D, so no format indicator needed.
- No year on date. Christopher Robin released August 3, 2018. August 15 was a Wednesday in 2018 — confirmed as 2018.
- Transaction number: "00796-3**081518**..." → 08/15/18 = August 15, 2018. Year confirmed.
- AdEve = Adult Evening at $10.00 (higher than the $9.00 matinee price seen on other variants).

---

#### Ticket 2: War for the Planet of the Apes (bottom left)

**Fields extracted:**

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Format | 2D |
| Movie | 2D WAR PLANET O (truncated from "War for the Planet of the Apes") |
| Day | Thu |
| Date | Jul 13 |
| Showtime | 10:15 PM |
| Ticket Type | AdEve |
| Ticket Price | $10.00 |
| MPAA Rating | PG13 |
| Auditorium | 8 |
| Seat/Row | NA (not visible) |
| Transaction # | 00065-507131712122820 |
| Barcode | NA |
| QR Code | NA |

**Observations:**
- Severely truncated title: "2D WAR PLANET O" → "War for the Planet of the Apes". Most of the title is missing — only ~40% visible.
- "2D" format prefix present because this film also had a 3D release.
- No year on date. War for the Planet of the Apes released July 14, 2017. July 13 was a Thursday — this is a **Thursday night preview screening** (10:15 PM the night before wide release).
- Transaction number: "00065-5**071317**..." → 07/13/17 = July 13, 2017. Year confirmed.
- Rating PG13 visible near the circle design area.

---

#### Ticket 3: King Arthur: Legend of the Sword (right)

**Fields extracted:**

| Field | Raw Value |
|---|---|
| Theater Name | Cinemaworld Lincoln 16 |
| Format | 2D |
| Movie | 2D KING ARTHUR (truncated from "King Arthur: Legend of the Sword") |
| Day | Sun |
| Date | May 14 |
| Showtime | 4:30 PM |
| Ticket Type | AdEve |
| Ticket Price | $10.00 |
| MPAA Rating | PG13 |
| Auditorium | 7 |
| Seat/Row | NA (not visible) |
| Transaction # | 00181-505141716141408 |
| Barcode | NA |
| QR Code | NA |

**Observations:**
- Title truncated: "2D KING ARTHUR" → "King Arthur: Legend of the Sword". The entire subtitle is missing.
- "2D" format prefix — film also had a 3D release.
- No year on date. King Arthur: Legend of the Sword released May 12, 2017. May 14 was a Sunday in 2017 — confirmed as 2017.
- Transaction number: "00181-5**051417**..." → 05/14/17 = May 14, 2017. Year confirmed.
- "AdEve" at 4:30 PM — "Evening" pricing may start earlier on weekends at this theater. This is a useful observation for ticket type interpretation.
- Ticket has a worn/torn bottom-right corner — slightly degraded but all key fields are legible.

## Golden JSON

```json
[
  {
    "id": "cw-pre2020-001",
    "image_path": "cw-lincoln-cinema/cw-pre-2020-King_Arthur+Christopher_Rob+War_Planet.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Coca-Cola branded cardstock. Title truncated to 'CHRISTOPHER ROB'. No year — inferred from 2018 release + txn # confirms 08/15/18. No 2D prefix (no 3D option for this film).",
    "expected": {
      "movie_title": "Christopher Robin",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2018-08-15T18:45:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "7",
      "ticket_price": {
        "amount": 10.00,
        "currency": "USD"
      },
      "confidence_score": 0.85
    }
  },
  {
    "id": "cw-pre2020-002",
    "image_path": "cw-lincoln-cinema/cw-pre-2020-King_Arthur+Christopher_Rob+War_Planet.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Coca-Cola branded cardstock. Severely truncated title: '2D WAR PLANET O' = 'War for the Planet of the Apes'. Thursday night preview screening. Txn # confirms 07/13/17.",
    "expected": {
      "movie_title": "War for the Planet of the Apes",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2017-07-13T22:15:00",
      "seat_info": null,
      "format": "2D",
      "auditorium": "8",
      "ticket_price": {
        "amount": 10.00,
        "currency": "USD"
      },
      "confidence_score": 0.80
    }
  },
  {
    "id": "cw-pre2020-003",
    "image_path": "cw-lincoln-cinema/cw-pre-2020-King_Arthur+Christopher_Rob+War_Planet.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Coca-Cola branded cardstock. Truncated title: '2D KING ARTHUR' (subtitle 'Legend of the Sword' missing). Torn corner but legible. Txn # confirms 05/14/17.",
    "expected": {
      "movie_title": "King Arthur: Legend of the Sword",
      "theater_chain": "CW Theatres",
      "theater_name": "Cinemaworld Lincoln 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2017-05-14T16:30:00",
      "seat_info": null,
      "format": "2D",
      "auditorium": "7",
      "ticket_price": {
        "amount": 10.00,
        "currency": "USD"
      },
      "confidence_score": 0.80
    }
  }
]
```
