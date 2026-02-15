# Showcase Cinema de Lux — 2021-2022 (Vertical Thermal Receipt)

## Chain Overview
- **Chain**: Showcase Cinema de Lux (National Amusements subsidiary)
- **Locations analyzed**: Showcase Cinema de Lux Providence (Providence, RI), Showcase Cinema de Lux Attleboro 12 (Attleboro, MA)
- **Ticket type**: Physical thermal receipt, slightly higher quality paper (thicker than standard thermal, not cardboard)
- **Visual identifiers**: Tall vertical/portrait format. "SHOWCASE CINEMA DE LUX" watermark repeating diagonally across entire ticket. Light purple/gray horizontal separator lines between sections. "MOVIE TICKET" bold header at top.
- **Era**: 2021-2022
- **Website**: www.showcasecinemas.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Tall, narrow vertical ticket (portrait orientation) — this is the standard "vertical format" seen at many theater chains. Slightly higher quality paper than standard thermal. Repeating diagonal watermark reads "SHOWCASE CINEMA DE LUX". Light purple/gray horizontal lines separate field groups. Layout top-to-bottom:

1. **"MOVIE TICKET"** — bold header at top, all caps.
2. **Movie title** — full title, not truncated (e.g. "The Batman", "Nobody"). Mixed case.
3. **MPAA rating + Date** — single line: "RATING MM/DD/YYYY" (e.g. "PG-13 03/05/2022", "R 05/02/2021"). Uses **full 4-digit year**.
4. **Day + Showtime** — single line: "Day HH:MM pm" (e.g. "Sat 02:15 pm", "Sun 03:45 pm"). 12-hour format with am/pm.
5. **"GAR"** — ticket pricing category (appears on every ticket). Likely "General Admission Reserved" — reserved seating at general admission pricing.
6. **Theatre number** — "Theatre N" in large font (e.g. "Theatre 17", "Theatre 2"). This is the auditorium/screen.
7. **Seat** — "SEAT" followed by combined row letter + seat number, no separator (e.g. "SEAT L25" = Row L, Seat 25; "SEAT G4" = Row G, Seat 4).
8. **Price** — dollar amount (e.g. "$15.25", "11.80"). May or may not include the "$" symbol.
9. *(gap/whitespace)*
10. **Credit card info** — "Cred - XXXXX" with last 4-5 digits of payment card (e.g. "Cred - 32751", "Cred - 3173").
11. **Terminal code** — store number + terminal type + terminal number (e.g. "428KIOSK04" = store 428, kiosk #04; "444BOX02" = store 444, box office #02).
12. **Terminal shortcode** — abbreviated repeat (e.g. "K04" for KIOSK04). May not appear on all tickets.
13. **Location name** — theater location (e.g. "Providence", "Attleboro 12"). The number after location may be the screen count.
14. **Date + Time of sale** — "MM/DD/YYYY HH:MM pm" (e.g. "03/05/2022 01:56 pm"). This is the PURCHASE time, not showtime.
15. **Ticket number** — "Ticket: XXXXXXXX/NNN" (e.g. "Ticket: 01515425/002"). The "/NNN" suffix indicates which ticket in a group purchase.
16. **QR code** — at the bottom.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **"GAR" is NOT General Admission**: Despite sounding like "General Admission", all tickets with "GAR" have assigned seats. It likely means "General Admission Reserved" — a pricing tier with reserved seating. Extract "GAR" as the ticket_type.
- **Combined seat format**: "SEAT L25" means Row L, Seat 25 — the row letter and seat number are NOT separated by space, comma, or dash. Must parse: letter(s) = row, trailing digit(s) = seat number. E.g. "G4" = Row G, Seat 4.
- **Time of sale vs showtime**: Two timestamps appear. The **showtime** is near the top with the day (e.g. "Sat 02:15 pm"). The **time of sale** is near the bottom with the purchase date (e.g. "01:56 pm"). Extract the showtime only.
- **Credit card data**: "Cred - 32751" is partial credit card info. Do NOT extract this — it's payment data, not ticket data.
- **Terminal type reveals purchase method**: "KIOSK04" = self-service kiosk, "BOX02" = box office counter. This is metadata, not movie data.
- **Full 4-digit year**: Unlike Regal (2-digit) and CW variants, Showcase uses full "MM/DD/YYYY" format. No year inference needed.
- **Full movie titles**: Titles are NOT truncated on Showcase tickets (unlike Regal and CW pre-2020). "The Batman" and "Nobody" are complete.
- **Price may lack "$" symbol**: The Batman shows "$15.25" but Nobody shows "11.80" without the dollar sign. Always interpret as USD.
- **"SHOWCASE CINEMA DE LUX" watermark**: Repeating diagonal text across the entire ticket. This is a design element, not extractable data — but it IS the primary chain identifier since "Showcase" doesn't appear in the printed fields.
- **Location number suffix**: "Attleboro 12" — the "12" likely means 12 screens. Don't confuse this with the theatre/auditorium number (which is separate as "Theatre 2").
- **Ticket number "/NNN" suffix**: "01515425/002" means ticket #2 in a purchase, "00991702/001" means ticket #1. If the image shows only one ticket from a multi-ticket purchase, extract just the one visible.
- **No chain name in printed text**: Like Regal, the chain name ("Showcase") does NOT appear in the ticket text — only in the diagonal watermark. Gemini must recognize the watermark or set theater_chain to null.

## Raw Field Extraction

### showcase-21-22-The_Batman+Nobody.HEIC

> Note: This single image contains TWO tickets side by side.

#### Ticket 1: The Batman (left)

**Top to bottom:**

| Field | Raw Value |
|---|---|
| Header | MOVIE TICKET |
| Movie | The Batman |
| MPAA Rating | PG-13 |
| Date | 03/05/2022 |
| Day | Sat |
| Showtime | 02:15 pm |
| Pricing Category | GAR |
| Theatre (Auditorium) | 17 |
| Seat | L25 (Row L, Seat 25) |
| Price | $15.25 |
| Credit Card | Cred - 32751 |
| Terminal | 428KIOSK04 |
| Terminal Short | K04 |
| Location | Providence |
| Date of Sale | 03/05/2022 |
| Time of Sale | 01:56 pm |
| Ticket # | 01515425/002 |
| QR Code | Yes (visible) |
| Barcode | NA |

**Observations:**
- The Batman (PG-13) released March 4, 2022. Date 03/05/2022 (Saturday) is opening weekend. Confirmed.
- "428KIOSK04" — purchased at self-service kiosk #04 at store 428 (Providence location).
- Time of sale 01:56 pm, showtime 02:15 pm — purchased 19 minutes before showtime at the kiosk.
- Ticket #002 — this was the second ticket in a group purchase (at least 2 tickets bought together).
- SEAT L25 — Row L is fairly far back, seat 25 is toward the end of the row. Large auditorium (Theatre 17).
- $15.25 for 2022 standard pricing at Showcase.

---

#### Ticket 2: Nobody (right)

**Top to bottom:**

| Field | Raw Value |
|---|---|
| Header | MOVIE TICKET |
| Movie | Nobody |
| MPAA Rating | R |
| Date | 05/02/2021 |
| Day | Sun |
| Showtime | 03:45 pm |
| Pricing Category | GAR |
| Theatre (Auditorium) | 2 |
| Seat | G4 (Row G, Seat 4) |
| Price | 11.80 |
| Credit Card | Cred - 3173 |
| Terminal | 444BOX02 |
| Location | Attleboro 12 |
| Date of Sale | 05/02/2021 |
| Time of Sale | 03:20 pm |
| Ticket # | 00991702/001 |
| QR Code | Yes (visible) |
| Barcode | NA |

**Observations:**
- Nobody (R) released March 26, 2021. Date 05/02/2021 (Sunday) is about 5 weeks after release. Confirmed.
- "444BOX02" — purchased at box office counter #02 at store 444 (Attleboro location).
- Time of sale 03:20 pm, showtime 03:45 pm — purchased 25 minutes before showtime at the box office.
- Ticket #001 — first (or only) ticket in this purchase.
- SEAT G4 — Row G is mid-front, seat 4 is a left-side aisle seat. Smaller auditorium (Theatre 2).
- $11.80 without "$" sign — lower price reflects 2021 COVID-era pricing and/or matinee rate.
- Different location from The Batman ticket: Attleboro 12 vs Providence. Same chain, different theaters.
- "Attleboro 12" — the "12" is the screen count for the location, NOT the theatre/auditorium (which is "Theatre 2").

## Golden JSON

```json
[
  {
    "id": "showcase-21-22-001",
    "image_path": "showcase/showcase-21-22-The_Batman+Nobody.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Cinema de Lux Providence. Vertical format ticket. GAR = General Admission Reserved (has assigned seat L25). Purchased at KIOSK04. Ticket #002 in group purchase.",
    "expected": {
      "movie_title": "The Batman",
      "theater_chain": "Showcase Cinema de Lux",
      "theater_name": "Showcase Cinema de Lux Providence",
      "theater_location": "Providence, RI",
      "showtime": "2022-03-05T14:15:00",
      "seat_info": {
        "row": "L",
        "seat": "25"
      },
      "format": "Standard",
      "auditorium": "17",
      "ticket_price": {
        "amount": 15.25,
        "currency": "USD"
      },
      "confidence_score": 0.95
    }
  },
  {
    "id": "showcase-21-22-002",
    "image_path": "showcase/showcase-21-22-The_Batman+Nobody.HEIC",
    "source": "manual",
    "added_date": "2026-02-15",
    "notes": "Showcase Cinema de Lux Attleboro. Same image as showcase-21-22-001. GAR pricing. BOX02 = box office purchase. 'Attleboro 12' — 12 is screen count, not auditorium (Theatre 2 is the auditorium). Price lacks '$' symbol.",
    "expected": {
      "movie_title": "Nobody",
      "theater_chain": "Showcase Cinema de Lux",
      "theater_name": "Showcase Cinema de Lux Attleboro",
      "theater_location": "Attleboro, MA",
      "showtime": "2021-05-02T15:45:00",
      "seat_info": {
        "row": "G",
        "seat": "4"
      },
      "format": "Standard",
      "auditorium": "2",
      "ticket_price": {
        "amount": 11.80,
        "currency": "USD"
      },
      "confidence_score": 0.95
    }
  }
]
```
