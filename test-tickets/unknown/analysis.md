# Unknown / Other Theaters

## Overview
This folder is for tickets from chains not covered by the main folders, including:
- Independent/local theaters
- Digital-only tickets (Fandango, Atom Tickets, etc.)
- International theaters
- Tickets where the chain can't be identified
- Heavily damaged or faded tickets (stress tests)

## Adding Tickets

For each ticket, create a section below with the raw field extraction and
golden JSON. If you accumulate 3+ tickets from the same chain, consider
creating a dedicated folder for that chain.

## Raw Field Extraction

### *(ticket-filename.ext)*

**Chain (if identifiable):** *(name or "Unknown")*
**Ticket type:** *(Physical / Digital / Screenshot)*
**Notes:** *(Why is this in the unknown folder? What makes it unusual?)*

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | |
| Theater Name | |
| Movie | |
| Date | |
| Time | |
| Screen | |
| Seat | |
| Row | |
| Ticket Price | |
| Format | |
| Barcode / QR | |

**Observations:**
- *(Fill in after analyzing the ticket image)*

## Golden JSON

```json
{
  "id": "unknown-001",
  "image_path": "unknown/FILENAME.ext",
  "source": "manual",
  "added_date": "",
  "notes": "",
  "expected": {
    "movie_title": ""
  }
}
```
