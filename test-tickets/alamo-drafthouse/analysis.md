# Alamo Drafthouse Cinema

## Chain Overview
- **Chain**: Alamo Drafthouse Cinema
- **Location analyzed**: *(e.g. Alamo Drafthouse South Lamar, Austin, TX)*
- **Ticket type**: *(Physical thermal receipt / Digital / Mobile app screenshot)*
- **Website**: www.drafthouse.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

*(Describe the field layout top-to-bottom. What order do fields appear on
Alamo Drafthouse tickets? Any unique branding? Where does the movie title
appear relative to the showtime? Food/drink orders mixed in?)*

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

*(Note any tricky fields. For example:
- Alamo receipts may include food/drink orders — don't confuse with ticket price
- Pre-show event titles vs actual movie title?
- Special screenings (Terror Tuesday, Weird Wednesday) with non-standard naming?
- Season Pass or Victory membership numbers?)*

## Variants
*(List distinct ticket designs you've seen — e.g. combined food + ticket receipt,
mobile e-ticket, special event ticket)*

## Raw Field Extraction

### *(ticket-filename.ext)*

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | Alamo Drafthouse |
| Cashier | |
| Station | |
| Time of Sale | |
| T/N | |
| Screen | |
| Movie | |
| Movie Rating | |
| Date | |
| Day | |
| Time | |
| Amount of Tickets Bought | |
| Ticket Type | |
| Ticket Price | |
| Extra Costs | |
| Food/Drink | |
| Seat | |
| Row | |
| Barcode | |
| QR Code | |

**Observations:**
- *(Fill in after analyzing the ticket image)*

## Golden JSON

```json
{
  "id": "alamo-001",
  "image_path": "alamo-drafthouse/FILENAME.ext",
  "source": "manual",
  "added_date": "",
  "notes": "",
  "expected": {
    "movie_title": "",
    "theater_chain": "Alamo Drafthouse",
    "theater_name": "",
    "theater_location": ""
  }
}
```
