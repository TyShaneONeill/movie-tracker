# CW Theatres — "26" Variant (2025-26 Thin Paper Design)

## Variant Overview
- **Chain**: CW Theatres
- **Location analyzed**: CW Theatres Lincoln Mall 16, Lincoln, RI
- **Ticket type**: Physical thin paper ticket (newer design, 2025-26 era)
- **Visual identifiers**: *(describe the color scheme, any logos or watermarks)*
- **Era**: 2025-2026 (current design)
- **Website**: www.cwtheatres.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

*(Describe the field layout top-to-bottom for this variant. What order do fields
appear? What does the ticket look like visually? Reference the 3 ticket images
below to identify the consistent layout pattern across them.)*

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

*(Note any tricky fields, ambiguous abbreviations, formatting quirks, etc.
Compare against the older "M" variant — what changed?)*

## Raw Field Extraction

### cw-26-Den_of_Thieves_2_Pantera.HEIC

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | |
| Cashier | |
| Station | |
| Time of Sale | |
| T/N | |
| Screen | |
| Movie | Den of Thieves 2: Pantera |
| Movie Rating | |
| Date | |
| Day | |
| Time | |
| Amount of Tickets Bought | |
| Ticket Type | |
| Ticket Price | |
| Extra Costs | |
| Seat | |
| Row | |
| Barcode | |
| QR Code | |

**Observations:**
- *(Fill in after analyzing the ticket image)*

---

### cw-26-Captain_America_Brave_New_World.HEIC

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | |
| Cashier | |
| Station | |
| Time of Sale | |
| T/N | |
| Screen | |
| Movie | Captain America: Brave New World |
| Movie Rating | |
| Date | |
| Day | |
| Time | |
| Amount of Tickets Bought | |
| Ticket Type | |
| Ticket Price | |
| Extra Costs | |
| Seat | |
| Row | |
| Barcode | |
| QR Code | |

**Observations:**
- *(Fill in after analyzing the ticket image)*

---

### cw-26-Marty_Supreme.HEIC

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | |
| Cashier | |
| Station | |
| Time of Sale | |
| T/N | |
| Screen | |
| Movie | Marty Supreme |
| Movie Rating | |
| Date | |
| Day | |
| Time | |
| Amount of Tickets Bought | |
| Ticket Type | |
| Ticket Price | |
| Extra Costs | |
| Seat | |
| Row | |
| Barcode | |
| QR Code | |

**Observations:**
- *(Fill in after analyzing the ticket image)*

## Golden JSON

```json
[
  {
    "id": "cw-26-001",
    "image_path": "cw-lincoln-cinema/cw-26-Den_of_Thieves_2_Pantera.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Newer thin paper variant (2025-26 design)",
    "expected": {
      "movie_title": "Den of Thieves 2: Pantera",
      "theater_chain": "CW Theatres",
      "theater_name": "CW Theatres Lincoln Mall 16",
      "theater_location": "Lincoln, RI"
    }
  },
  {
    "id": "cw-26-002",
    "image_path": "cw-lincoln-cinema/cw-26-Captain_America_Brave_New_World.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Newer thin paper variant (2025-26 design)",
    "expected": {
      "movie_title": "Captain America: Brave New World",
      "theater_chain": "CW Theatres",
      "theater_name": "CW Theatres Lincoln Mall 16",
      "theater_location": "Lincoln, RI"
    }
  },
  {
    "id": "cw-26-003",
    "image_path": "cw-lincoln-cinema/cw-26-Marty_Supreme.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Newer thin paper variant (2025-26 design)",
    "expected": {
      "movie_title": "Marty Supreme",
      "theater_chain": "CW Theatres",
      "theater_name": "CW Theatres Lincoln Mall 16",
      "theater_location": "Lincoln, RI"
    }
  }
]
```
