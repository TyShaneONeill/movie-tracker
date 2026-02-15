# CW Theatres — "M" Variant (Older Cardboard Design)

## Variant Overview
- **Chain**: CW Theatres
- **Location analyzed**: CW Theatres Lincoln Mall 16, Lincoln, RI
- **Ticket type**: Physical cardboard ticket (thicker stock, not thermal paper)
- **Visual identifiers**: Black, white, and gold color scheme. Large "M" with a crown over it in background.
- **Era**: Pre-2025 (older design, replaced by thinner paper in 2025-26)
- **Website**: www.cwtheatres.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Cardboard ticket with decorative "M" crown watermark in background. Black, white,
and gold color scheme. Fields printed on ticket: transaction number (long format like
"0006-99030423133828"), screen number, movie title, MPAA rating, date (MM/DD/YYYY —
year may be partially cut off or illegible), day of week, showtime (H:MM AM/PM),
ticket quantity, ticket type (abbreviated codes like "SRMat"), price, row letter,
seat number. No barcode or QR code visible on this variant.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Abbreviated ticket types**: "SRMat" likely means "Senior Matinee". Other codes may appear — extract the raw abbreviation AND interpret the likely meaning.
- **No year**: Date may not show the year. Use the movie's theatrical release date to infer the year.
- **No barcode/QR**: This variant has no scannable codes — confirmation comes from the transaction number only.
- **Seat format**: Row and seat are separate fields (Row: O, Seat: 11), not combined.
- **No time of sale**: Unlike some chains, this variant only shows the showtime, not when the ticket was purchased.
- **MPAA rating on ticket**: This variant includes the movie's rating (PG13, R, etc.) which is useful for TMDB matching confidence.

## Raw Field Extraction

### cw-M-The_Flash.HEIC (Creed III)

> Note: Filename says "The_Flash" but the ticket is actually for Creed III.

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | CW Theatres |
| Cashier | NA |
| Station | NA |
| Time of Sale | NA |
| T/N | 0006-99030423133828 |
| Screen | 8 |
| Movie | Creed III |
| Movie Rating | PG13 |
| Date | 03/04/202? |
| Day | Saturday |
| Time | 1:40 PM |
| Ends at | NA |
| Amount of Tickets Bought | 1 |
| Ticket Type | SRMat? |
| Ticket Price | $9.00 |
| Extra Costs | NA |
| Website | www.cwtheatres.com |
| Extra Text | NA |
| Seat | 11 |
| Row | O |
| Barcode | NA |
| QR Code | NA |

**Observations:**
- This is not a digital ticket.
- The ticket is rich in data.
- Screen 8.
- The ticket price is $9.00.
- The extra cost is NA.
- The amount of tickets bought is 1.
- The showtime is 1:40 PM, but the time of sale is NA.
- The year is not given, but we can maybe determine the year of when the title of the movie was actually released in theaters for the first time? (Creed III released March 3, 2023 — so date is likely 03/04/2023)
- The ticket type is SRMat, which might be a SENIOR but what does Mat stand for? (Likely "Senior Matinee")
- The ticket number is 0006-99030423133828.
- The barcode is NA.
- The QR Code is NA.
- The background has an M with a crown over it. Color Scheme is Black, White, and Gold.
- The rating is PG13.
- This is more than likely the case for many other CW Theatres physical tickets we see with this color scheme and M in the background. Also the paper type is Cardboard compared to thin paper they use in 2025-26.

## Golden JSON

```json
{
  "id": "cw-M-001",
  "image_path": "cw-lincoln-cinema/cw-M-The_Flash.HEIC",
  "source": "manual",
  "added_date": "2026-02-15",
  "notes": "Older cardboard variant with M/crown background. Year partially illegible — inferred from Creed III release (March 2023). Ticket type 'SRMat' = Senior Matinee.",
  "expected": {
    "movie_title": "Creed III",
    "theater_chain": "CW Theatres",
    "theater_name": "CW Theatres Lincoln Mall 16",
    "theater_location": "Lincoln, RI",
    "showtime": "2023-03-04T13:40:00",
    "seat_info": {
      "row": "O",
      "seat": "11"
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
```
