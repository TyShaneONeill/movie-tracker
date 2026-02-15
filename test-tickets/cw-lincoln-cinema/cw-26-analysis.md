# CW Theatres — "26" Variant (2025-26 Thin Paper Design)

## Variant Overview
- **Chain**: CW Theatres
- **Location analyzed**: CW Theatres Lincoln Mall 16, Lincoln, RI
- **Ticket type**: Physical thin paper ticket (newer design, 2025-26 era)
- **Visual identifiers**: Plain white paper, no logos, no watermarks, no color scheme. Monospaced/typewriter-style font. Minimal layout.
- **Era**: 2025-2026 (current design)
- **Website**: www.cwtheatres.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Plain white thin paper ticket with a simple, vertically stacked layout. No theater chain name or branding appears anywhere on the ticket. Fields top-to-bottom:

1. **Movie title** — large font, centered. Long titles wrap to the next line (e.g. "Captain America: Brave N / ew World").
2. **Screen number** — prefixed with "Screen" followed by zero-padded number (e.g. "Screen 03", "Screen 07", "Screen 15").
3. **Date and showtime** — single line in format "Month Day, H:MM pm" (e.g. "February 1, 4:00 pm"). No year is included.
4. **End time** — smaller font, "Ends at H:MM pm" (e.g. "Ends at 6:10 pm").
5. **QR code** — centered, medium-sized.
6. **Code number** — prefixed "Code: #XXXXXXXX" (8-digit number).
7. **Ticket type** — full English word, underlined (e.g. "Senior", "Student", "Military").
8. **Ticket number** — "Ticket #XXXXXXXXX" (9-digit number).

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **No year on date**: The date only shows "Month Day" with NO year. Must infer from the movie's theatrical release window. This is the biggest extraction challenge.
- **No theater name**: Unlike the "M" variant, the theater chain and location do NOT appear on the ticket. Must be inferred from context or set to null.
- **No price**: This variant does not show the ticket price at all.
- **No seat/row**: No seat or row information — this may be general admission or the info is simply omitted.
- **No MPAA rating**: Unlike the "M" variant, no movie rating appears.
- **No time of sale**: Only the showtime and end time are shown.
- **Full ticket type names**: Unlike the "M" variant's abbreviations (SRMat, AdltMat), this variant uses full words: "Senior", "Student", "Military". Extract as-is.
- **Two ID numbers**: Both a "Code" number and a "Ticket" number appear. Use the Code number as the confirmation_number (it appears to be the primary identifier, printed larger and paired with the QR code).
- **Title wrapping**: Long movie titles break mid-word across lines (e.g. "Panter" / "a"). Gemini must reconstruct the full title.
- **"Ends at" time**: This is the movie END time, not the showtime. Do not confuse — the showtime is on the line above.
- **Screen zero-padding**: Screen numbers are zero-padded ("03" not "3"). Strip the leading zero for the auditorium field.

## Differences from "M" Variant

| Feature | "M" Variant (Cardboard) | "26" Variant (Thin Paper) |
|---|---|---|
| Material | Thick cardboard | Thin paper |
| Branding | "M" crown watermark, black/white/gold | No branding, plain white |
| Theater name | Printed on ticket | Not printed |
| Price | Shown | Not shown |
| Seat/Row | Shown | Not shown |
| Rating | Shown (PG13, R, etc.) | Not shown |
| Ticket type | Abbreviated (SRMat) | Full word (Senior) |
| Date format | MM/DD/YYYY (year may be partial) | "Month Day" (no year at all) |
| Scannable code | None (no barcode/QR) | QR code present |
| ID numbers | Single T/N | Two: Code # and Ticket # |
| End time | Not shown | Shown ("Ends at...") |

## Raw Field Extraction

### cw-26-Den_of_Thieves_2_Pantera.HEIC

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | NA (not printed) |
| Movie | Den of Thieves 2: Pantera |
| Screen | 03 |
| Date | February 1 |
| Showtime | 4:00 pm |
| Ends at | 6:10 pm |
| QR Code | Yes (visible) |
| Code | #12852042 |
| Ticket Type | Senior |
| Ticket # | 765410049 |
| Price | NA (not printed) |
| Seat | NA (not printed) |
| Row | NA (not printed) |
| MPAA Rating | NA (not printed) |

**Observations:**
- Title wraps across two lines: "Den of Thieves 2: Panter" / "a". Gemini must reconstruct as "Den of Thieves 2: Pantera".
- No year — Den of Thieves 2: Pantera released January 10, 2025, so this is February 1, 2025.
- Paper is slightly crumpled but fully legible.
- "Senior" ticket type (full word, unlike "SRMat" on older variant).

---

### cw-26-Captain_America_Brave_New_World.HEIC

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | NA (not printed) |
| Movie | Captain America: Brave New World |
| Screen | 07 |
| Date | February 22 |
| Showtime | 1:15 pm |
| Ends at | 3:23 pm |
| QR Code | Yes (visible) |
| Code | #13218018 |
| Ticket Type | Student |
| Ticket # | 270410133 |
| Price | NA (not printed) |
| Seat | NA (not printed) |
| Row | NA (not printed) |
| MPAA Rating | NA (not printed) |

**Observations:**
- Title wraps: "Captain America: Brave N" / "ew World". Gemini must reconstruct full title.
- No year — Captain America: Brave New World released February 14, 2025, so this is February 22, 2025.
- "Student" ticket type — a new category not seen on "M" variant.
- Last digit of Code might be 8 or 6 (slightly ambiguous print quality).

---

### cw-26-Marty_Supreme.HEIC

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | NA (not printed) |
| Movie | Marty Supreme |
| Screen | 15 |
| Date | December 31 |
| Showtime | 4:55 pm |
| Ends at | 7:35 pm |
| QR Code | Yes (visible) |
| Code | #22922197 |
| Ticket Type | Military |
| Ticket # | 182110222 |
| Price | NA (not printed) |
| Seat | NA (not printed) |
| Row | NA (not printed) |
| MPAA Rating | NA (not printed) |

**Observations:**
- Short title fits on one line without wrapping.
- No year — Marty Supreme released December 25, 2025, so this is December 31, 2025.
- "Military" ticket type — another new category.
- Screen 15 — highest screen number seen, confirms this is a large multiplex (Lincoln Mall 16).

## Golden JSON

```json
[
  {
    "id": "cw-26-001",
    "image_path": "cw-lincoln-cinema/cw-26-Den_of_Thieves_2_Pantera.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Newer thin paper variant. No year on date — inferred from Den of Thieves 2 release (Jan 2025). Title wraps across lines.",
    "expected": {
      "movie_title": "Den of Thieves 2: Pantera",
      "theater_chain": "CW Theatres",
      "theater_name": "CW Theatres Lincoln Mall 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2025-02-01T16:00:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "3",
      "ticket_price": null,
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-26-002",
    "image_path": "cw-lincoln-cinema/cw-26-Captain_America_Brave_New_World.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Newer thin paper variant. No year on date — inferred from Captain America release (Feb 2025). Title wraps mid-word.",
    "expected": {
      "movie_title": "Captain America: Brave New World",
      "theater_chain": "CW Theatres",
      "theater_name": "CW Theatres Lincoln Mall 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2025-02-22T13:15:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "7",
      "ticket_price": null,
      "confidence_score": 0.90
    }
  },
  {
    "id": "cw-26-003",
    "image_path": "cw-lincoln-cinema/cw-26-Marty_Supreme.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Newer thin paper variant. No year on date — inferred from Marty Supreme release (Dec 2025). Military ticket type.",
    "expected": {
      "movie_title": "Marty Supreme",
      "theater_chain": "CW Theatres",
      "theater_name": "CW Theatres Lincoln Mall 16",
      "theater_location": "Lincoln, RI",
      "showtime": "2025-12-31T16:55:00",
      "seat_info": null,
      "format": "Standard",
      "auditorium": "15",
      "ticket_price": null,
      "confidence_score": 0.90
    }
  }
]
```
