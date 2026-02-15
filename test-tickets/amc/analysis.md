# AMC Theatres

## Chain Overview
- **Chain**: AMC Theatres
- **Location analyzed**: *(e.g. AMC Metreon 16, San Francisco, CA)*
- **Ticket type**: *(Physical thermal receipt / Digital / Mobile app screenshot)*
- **Website**: www.amctheatres.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

*(Describe the field layout top-to-bottom. What order do fields appear on
AMC tickets? Is there a header with the AMC logo? Where does the movie title
appear relative to the showtime? What does the barcode/QR section look like?)*

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

*(Note any tricky fields. For example:
- Does the format name get appended to the movie title? (e.g. "Dune: Part Two - DOLBY")
- Are there loyalty/Stubs numbers that could be confused with confirmation codes?
- Does AMC show both purchase time and showtime?
- Any abbreviations that need decoding?)*

## Variants
*(List distinct ticket designs you've seen — e.g. kiosk thermal receipt,
mobile e-ticket, box office receipt, different locations with different formats)*

## Raw Field Extraction

### *(ticket-filename.ext)*

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | AMC |
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
  "id": "amc-001",
  "image_path": "amc/FILENAME.ext",
  "source": "manual",
  "added_date": "",
  "notes": "",
  "expected": {
    "movie_title": "",
    "theater_chain": "AMC",
    "theater_name": "",
    "theater_location": ""
  }
}
```
