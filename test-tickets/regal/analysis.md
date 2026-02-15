# Regal Cinemas

## Chain Overview
- **Chain**: Regal Cinemas
- **Location analyzed**: *(e.g. Regal Union Square, New York, NY)*
- **Ticket type**: *(Physical thermal receipt / Digital / Mobile app screenshot)*
- **Website**: www.regmovies.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

*(Describe the field layout top-to-bottom. What order do fields appear on
Regal tickets? Is there a crown logo? Where does the movie title appear
relative to the showtime? What does the barcode/QR section look like?)*

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

*(Note any tricky fields. For example:
- Does Regal append format to title? (e.g. "Oppenheimer: IMAX")
- Are there Regal Crown Club numbers that could be confused with confirmation codes?
- How does Regal format date/time differently from other chains?
- Any abbreviations that need decoding?)*

## Variants
*(List distinct ticket designs you've seen — e.g. kiosk receipt, mobile
e-ticket, box office receipt, RPX vs standard)*

## Raw Field Extraction

### *(ticket-filename.ext)*

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | Regal |
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
  "id": "regal-001",
  "image_path": "regal/FILENAME.ext",
  "source": "manual",
  "added_date": "",
  "notes": "",
  "expected": {
    "movie_title": "",
    "theater_chain": "Regal",
    "theater_name": "",
    "theater_location": ""
  }
}
```
