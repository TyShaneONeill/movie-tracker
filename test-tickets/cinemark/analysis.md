# Cinemark Theatres

## Chain Overview
- **Chain**: Cinemark Theatres
- **Location analyzed**: *(e.g. Cinemark XD, Dallas, TX)*
- **Ticket type**: *(Physical thermal receipt / Digital / Mobile app screenshot)*
- **Website**: www.cinemark.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

*(Describe the field layout top-to-bottom. What order do fields appear on
Cinemark tickets? Logo placement? Where does the movie title appear relative
to the showtime? What does the barcode/QR section look like?)*

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

*(Note any tricky fields. For example:
- Does Cinemark use XD branding that gets mixed into the title?
- Cinemark Movie Rewards numbers vs confirmation codes?
- Any unusual date/time formatting?
- Abbreviations that need decoding?)*

## Variants
*(List distinct ticket designs you've seen — e.g. kiosk receipt, mobile
e-ticket, XD format, standard)*

## Raw Field Extraction

### *(ticket-filename.ext)*

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | Cinemark |
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
| Seat | |
| Row | |
| Barcode | |
| QR Code | |

**Observations:**
- *(Fill in after analyzing the ticket image)*

## Golden JSON

```json
{
  "id": "cinemark-001",
  "image_path": "cinemark/FILENAME.ext",
  "source": "manual",
  "added_date": "",
  "notes": "",
  "expected": {
    "movie_title": "",
    "theater_chain": "Cinemark",
    "theater_name": "",
    "theater_location": ""
  }
}
```
