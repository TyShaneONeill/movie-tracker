# West Wind Drive-In

## Chain Overview
- **Chain**: West Wind Drive-In
- **Location analyzed**: West Wind Capitol 6, San Jose, CA
- **Ticket type**: Physical thermal receipt
- **Website**: www.westwinddi.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Thermal receipt printed top-to-bottom. Fields in order: chain name, cashier name,
station ID, transaction timestamp (HH;MM DDMMMYY format — note semicolon not colon),
transaction number (T/N), screen number combined with FM radio frequency
(e.g. "6 - FM 101.3"), movie title, date (MM/DD/YYYY), showtime (H:MM AM/PM),
ticket quantity, ticket type, total price for all tickets, service fee total,
website URL, legal disclaimer text, barcode wrapped in asterisks.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **Screen + FM frequency**: "Screen: 6 - FM 101.3" — screen number is 6, the FM frequency (101.3) is the drive-in audio channel. Ignore the FM portion.
- **Multi-ticket pricing**: Price shown is the TOTAL for all tickets, not per-ticket. Look for quantity to calculate per-ticket price. Example: $18.00 for 2 tickets = $9.00 each.
- **Service fee**: Also a total, not per-ticket. Example: $2.50 for 2 tickets = $1.25 each.
- **Time of sale vs showtime**: Transaction timestamp (e.g. "18;38 20OCT25") is the purchase time, NOT the showtime. Showtime appears separately with the movie listing.
- **Timestamp format**: Uses semicolon instead of colon (18;38 = 18:38), and DDMMMYY format (20OCT25).
- **Barcode format**: Wrapped in asterisks: *001768544*. The number inside matches the T/N (transaction number).
- **No seat assignment**: This is a drive-in — there are no assigned seats.

## Variants

### variant-001: Current thermal receipt (2025)
- **Ticket images**: `IMG_0714.HEIC`
- **Paper type**: Thin thermal receipt paper

## Raw Field Extraction

### IMG_0714.HEIC (Good Fortune)

**Top to bottom of ticket:**

| Field | Raw Value |
|---|---|
| Theater Chain | West Wind Drive-In |
| Cashier | Gabriel |
| Station | BOX08 |
| Time of Sale | 18;38 20OCT25 |
| T/N | 001768544 |
| Screen | 6 - FM 101.3 |
| Movie | Good Fortune |
| Date | 10/20/2025 |
| Time | 7:20 PM |
| Amount of Tickets Bought | 2 |
| Ticket Type | GENERAL |
| Ticket Price | 18.00 |
| Extra Costs | 2.50 |
| Website | www.westwinddi.com |
| Extra Text | Recoding of any kind is against the law Violators will be prosecuted |
| Barcode | *001768544* |

**Observations:**
- This is not a digital ticket.
- The ticket is very rich in data and will be great for testing.
- Screen 6 is combined with - FM 101.3 which is the audio for the movie, but could be confusing to parse.
- The ticket price is 18.00 for 2 tickets, so 9.00 per ticket.
- The extra cost is 2.50, which is the service fee, so 1.25 per ticket.
- The showtime is 7:20 PM, but the time of sale is 18:38, which is 6:38 PM. This is a 42 minute difference.
- The ticket type is GENERAL, which is the standard ticket type.
- The ticket number is 001768544.
- The barcode is *001768544*.
- This is more than likely the case for many other West Wind Drive In physical tickets we see.

## Golden JSON

```json
{
  "id": "west-wind-001",
  "image_path": "west-wind-capitol-6-drive-in/IMG_0714.HEIC",
  "source": "manual",
  "added_date": "2026-02-15",
  "notes": "Thermal receipt, 2-ticket purchase, drive-in with FM audio frequency",
  "expected": {
    "movie_title": "Good Fortune",
    "theater_chain": "West Wind Drive-In",
    "theater_name": "West Wind Capitol 6 Drive-In",
    "theater_location": "San Jose, CA",
    "showtime": "2025-10-20T19:20:00",
    "seat_info": null,
    "format": "Standard",
    "auditorium": "6",
    "ticket_price": {
      "amount": 9.00,
      "currency": "USD"
    },
    "confidence_score": 0.90
  }
}
```
