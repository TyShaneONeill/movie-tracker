# Regal Cinemas — Bellingham (2019 Thermal Receipt)

## Variant Overview
- **Chain**: Regal Cinemas
- **Location analyzed**: Regal Bellingham, Bellingham, MA
- **Ticket type**: Physical thermal receipt
- **Visual identifiers**: Off-white/cream paper with repeating Regal crown/shield watermark in background. Horizontal gray band across middle of ticket. Theatre number in inverted white-on-black box.
- **Era**: 2019 (pre-COVID era Regal)
- **Website**: www.regmovies.com

## Layout Description
> *This section feeds directly into the Gemini extraction prompt as context.*

Thermal receipt on cream-colored paper with repeating Regal crown/shield watermark pattern in the background. A horizontal gray band runs across the middle of the ticket. The layout is split into two visual columns — left side has movie info + QR code, right side has theatre number + transaction details. Fields:

**Left column (top to bottom):**
1. **Location name** — theater location in large font, NO chain prefix (e.g. "Bellingham" NOT "Regal Bellingham"). Just the location city/name.
2. **Movie title** — large bold font. Titles may be **truncated** if too long (e.g. "Jay Silent Bob" for "Jay and Silent Bob Reboot" — missing "and" and "Reboot").
3. **Showtime + Day + Date** — single line: "H:MMpm Day MM/DD/YY" (e.g. "7:00pm Tue 10/15/19"). Time first, then abbreviated day, then date with 2-digit year.
4. **Ticket type + Price + Code** — single line: "Type $XX.XX - CODE" (e.g. "General $20.00 - REGW"). The code suffix indicates purchase channel.
5. **QR code** — bottom left.

**Right column (top to bottom):**
6. **Theatre number** — "Theatre:" label followed by number in inverted white-on-black box (e.g. "Theatre: [14]"). This is the auditorium/screen.
7. **Transaction number** — "Trans #: XXXXXXX/N" (e.g. "Trans #: 1454661/3"). The "/N" suffix may indicate ticket number within a group purchase.
8. **Terminal + Cashier** — "XXXXCONXX - Name" (e.g. "1713CON04 - Branden"). "CON" likely = Console/Concession terminal. Name is the cashier/employee.
9. **Date + Time of sale** — "MM/DD/YY H:MMpm" (e.g. "10/15/19 6:52pm"). This is when the ticket was PURCHASED, not the showtime.

## Edge Cases
> *These warnings help Gemini avoid common misparses for this chain.*

- **No chain name on ticket**: The ticket prints only the LOCATION name ("Bellingham"), not "Regal" or "Regal Cinemas". Gemini must recognize Regal from the crown watermark, the "REGW" code, or general context — or set theater_chain to null.
- **Title truncation**: Like CW pre-2020, movie titles are truncated. "Jay Silent Bob" → "Jay and Silent Bob Reboot". Words may be dropped entirely (not just cut mid-word).
- **Time of sale vs showtime**: Two different timestamps appear. The showtime ("7:00pm") is in the left column with the movie info. The time of sale ("6:52pm") is at the bottom right with the transaction details. Gemini MUST extract the showtime, not the sale time.
- **"REGW" code**: Appears after the price. Likely "Regal Web" indicating an online/kiosk purchase. Other codes may exist (e.g. "REGB" for box office?). This is NOT a confirmation number — it's a purchase channel indicator.
- **Transaction number format**: "1454661/3" — the "/3" may mean ticket 3 in a group, or register 3. Use the full string including the slash as the confirmation_number.
- **Terminal + Cashier**: "1713CON04 - Branden" — "1713" is likely a store/location ID, "CON04" is Console/Terminal 04, and "Branden" is the cashier name. None of these are movie data — do not extract.
- **No seat/row**: This ticket shows no assigned seating. "General" admission means no reserved seats.
- **No MPAA rating**: Rating does not appear on this Regal ticket variant.
- **Special event pricing**: $20.00 for "General" is higher than typical ~$12-14 for Regal in 2019. This was a Fathom Events one-night screening (Jay and Silent Bob Reboot had limited Fathom Events showings on 10/15/2019). Price reflects event premium, not regular pricing.
- **Regal Crown Club numbers**: NOT present on this ticket, but other Regal tickets may show them. Crown Club numbers are loyalty IDs, NOT confirmation codes.
- **2-digit year**: Date uses MM/DD/YY format (e.g. "10/15/19"). Prepend "20" for full year.

## Raw Field Extraction

### regal-19-bellingham-Jay_and_Silent_Bob.HEIC

**Left column, top to bottom:**

| Field | Raw Value |
|---|---|
| Theater Location | Bellingham |
| Theater Chain | (not printed — Regal inferred from watermark + REGW code) |
| Movie | Jay Silent Bob (truncated from "Jay and Silent Bob Reboot") |
| Showtime | 7:00pm |
| Day | Tue |
| Date | 10/15/19 |
| Ticket Type | General |
| Ticket Price | $20.00 |
| Purchase Code | REGW |
| QR Code | Yes (visible, bottom left) |

**Right column, top to bottom:**

| Field | Raw Value |
|---|---|
| Theatre (Auditorium) | 14 |
| Trans # | 1454661/3 |
| Terminal | 1713CON04 |
| Cashier | Branden |
| Date of Sale | 10/15/19 |
| Time of Sale | 6:52pm |

**Full ticket field summary:**

| Field | Raw Value |
|---|---|
| Theater Chain | Regal (inferred) |
| Theater Name | Bellingham (location only) |
| Movie | Jay Silent Bob |
| MPAA Rating | NA (not printed) |
| Date | 10/15/19 |
| Day | Tue |
| Showtime | 7:00pm |
| Time of Sale | 6:52pm (8 minutes before showtime) |
| Ticket Type | General |
| Ticket Price | $20.00 |
| Purchase Code | REGW |
| Auditorium | 14 |
| Seat | NA (General Admission) |
| Row | NA (General Admission) |
| Trans # | 1454661/3 |
| Terminal | 1713CON04 |
| Cashier | Branden |
| QR Code | Yes |
| Barcode | NA |

**Observations:**
- Title is truncated: "Jay Silent Bob" — drops "and" and "Reboot" entirely. Unlike CW pre-2020 which truncates mid-word, Regal appears to drop whole words to fit.
- "Jay and Silent Bob Reboot" had a limited Fathom Events theatrical release on October 15, 2019 (Tuesday). Date matches exactly — this is a special event screening.
- $20.00 "General" pricing is ~$6-8 above standard Regal pricing for 2019, confirming this is a Fathom Events premium.
- Time of sale (6:52pm) is just 8 minutes before showtime (7:00pm) — last-minute purchase at the kiosk/counter.
- "Branden" is a cashier name — this confirms the ticket was purchased at the counter (not a kiosk), despite the "REGW" code.
- Regal crown/shield watermark visible in background — this is the primary visual identifier for the Regal chain since the chain name isn't printed.
- Ticket has a fold crease down the middle and slight wear on the right edge, but all text is fully legible.

## Golden JSON

```json
{
  "id": "regal-19-001",
  "image_path": "regal/regal-19-bellingham-Jay_and_Silent_Bob.HEIC",
  "source": "manual",
  "added_date": "2026-02-15",
  "notes": "Regal Bellingham 2019. Title truncated: 'Jay Silent Bob' = 'Jay and Silent Bob Reboot'. Fathom Events special screening ($20 premium). Chain name not printed — inferred from crown watermark + REGW code. Time of sale (6:52pm) ≠ showtime (7:00pm).",
  "expected": {
    "movie_title": "Jay and Silent Bob Reboot",
    "theater_chain": "Regal",
    "theater_name": "Regal Bellingham",
    "theater_location": "Bellingham, MA",
    "showtime": "2019-10-15T19:00:00",
    "seat_info": null,
    "format": "Standard",
    "auditorium": "14",
    "ticket_price": {
      "amount": 20.00,
      "currency": "USD"
    },
    "confidence_score": 0.90
  }
}
```
