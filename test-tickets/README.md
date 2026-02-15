# Ticket Scanning Accuracy Tests

Test infrastructure for measuring and regression-testing the ticket scanning pipeline (`scan-ticket` edge function + `ticket-processor.ts`).

## Folder Structure

```
test-tickets/
├── manifest.json           # Maps each ticket image to its expected golden output
├── manifest.schema.json    # JSON Schema for manifest validation
├── README.md
├── amc/                    # AMC ticket images
├── regal/                  # Regal ticket images
├── cinemark/               # Cinemark ticket images
├── alamo-drafthouse/       # Alamo Drafthouse ticket images
└── unknown/                # Unrecognized chains, digital tickets, edge cases
```

## Adding a New Test Ticket

1. **Drop the image** into the appropriate chain folder (use `unknown/` if unsure):
   ```
   test-tickets/amc/my-ticket-001.jpg
   ```

2. **Add an entry** to `manifest.json`:
   ```json
   {
     "id": "amc-my-ticket-001",
     "image_path": "amc/my-ticket-001.jpg",
     "source": "manual",
     "added_date": "2025-06-01",
     "notes": "Crumpled receipt, partial barcode",
     "expected": {
       "movie_title": "Inception",
       "theater_chain": "AMC",
       "theater_name": "AMC Empire 25",
       "theater_location": "New York, NY",
       "showtime": "2024-07-20T14:00:00",
       "seat_info": { "row": "D", "seat": "5" },
       "format": "IMAX",
       "auditorium": "3",
       "ticket_price": { "amount": 24.99, "currency": "USD" },
       "confidence_score": 0.85
     }
   }
   ```

3. **Omit fields** that aren't on the ticket — only `movie_title` is required:
   ```json
   {
     "id": "unknown-digital-001",
     "image_path": "unknown/digital-001.png",
     "source": "user-submitted",
     "added_date": "2025-06-01",
     "expected": {
       "movie_title": "Dune: Part Two",
       "showtime": "2024-03-01T19:00:00"
     }
   }
   ```

## Golden Output Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `movie_title` | string | Yes | Title as printed on the ticket (pre-TMDB matching) |
| `theater_chain` | string \| null | No | AMC, Regal, Cinemark, Alamo Drafthouse, etc. |
| `theater_name` | string \| null | No | Full theater name, e.g. "AMC Metreon 16" |
| `theater_location` | string \| null | No | City/state or address |
| `showtime` | string \| null | No | ISO 8601 datetime, e.g. "2024-03-15T19:30:00" |
| `seat_info` | object \| null | No | `{ "row": "H", "seat": "10" }` |
| `format` | string \| null | No | Standard, IMAX, 3D, Dolby, Dolby Atmos, 4DX, etc. |
| `auditorium` | string \| null | No | Screen/auditorium number |
| `ticket_price` | object \| null | No | `{ "amount": 16.99, "currency": "USD" }` |
| `confidence_score` | number | No | Expected minimum confidence (0-1) |

## Running Accuracy Comparisons

The accuracy test runner (to be built) will:

1. Read `manifest.json` for all ticket entries
2. Send each image through the `scan-ticket` edge function
3. Compare extracted fields against the golden `expected` output
4. Report per-field accuracy, overall accuracy, and regressions

**Field comparison rules:**
- **Exact match**: `movie_title`, `theater_chain`, `format`, `auditorium`
- **Fuzzy match**: `theater_name`, `theater_location` (Levenshtein distance threshold)
- **Numeric tolerance**: `ticket_price.amount` (within $0.01), `confidence_score` (extracted >= expected)
- **Time tolerance**: `showtime` (within 1 hour to handle timezone ambiguity)
- **Partial match**: `seat_info` (row and seat scored independently)

## Conventions

- **IDs**: `{chain}-{descriptor}-{number}`, e.g. `amc-crumpled-001`, `regal-digital-003`
- **Images**: JPEG or PNG, keep originals (don't resize — we want to test real-world inputs)
- **Git LFS**: If image files grow large, consider moving to Git LFS for this directory
- **Privacy**: Redact personal info (name, email, credit card) from ticket images before committing

## Mapping to App Types

The golden output fields map to the app's `ExtractedTicket` type in `lib/ticket-processor.ts`:

| Golden Field | ExtractedTicket Field |
|---|---|
| `movie_title` | `movie_title` |
| `theater_chain` | `theater_chain` |
| `theater_name` | `theater_name` |
| `theater_location` | *(not in ExtractedTicket — future field)* |
| `showtime` | `date` + `showtime` (combined) |
| `seat_info.row` | `seat_row` |
| `seat_info.seat` | `seat_number` |
| `format` | `format` |
| `auditorium` | `auditorium` |
| `ticket_price.amount` | `price_amount` |
| `ticket_price.currency` | `price_currency` |
| `confidence_score` | `GeminiExtraction.confidence_score` |
