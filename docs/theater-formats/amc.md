# AMC Theatres

## Overview
AMC Entertainment is one of the largest movie theater chains. Their tickets (especially from Apple Wallet / AMC app) include premium format names directly in the movie title field, requiring cleanup during import.

## Ticket Sources
- [x] Apple Wallet (via AMC Stubs app)
- [x] Email confirmation
- [ ] Physical ticket scan
- [x] Theater app screenshot

## Seat Format

| Field | Format | Example | Notes |
|-------|--------|---------|-------|
| Row | Single letter | `G` | A-Z, may extend to AA-ZZ in large auditoriums |
| Seat | Number | `12` | Just the number, no prefix |
| Auditorium | Separate field | `7`, `DOLBY 1` | May include format name |

### Seat Parsing Notes
- Row and seat are typically separate fields, not combined
- Auditorium number is distinct from row/seat
- Premium auditoriums may have format in the auditorium name (e.g., "DOLBY CINEMA 1", "IMAX")
- Standard format: "Row G, Seat 12, Auditorium 7"

## Movie Title

### Format Indicators in Title
AMC frequently embeds format names directly in the movie title field. These should be stripped:
- `DOLBY` or `DOLBY CINEMA`
- `IMAX`
- `PRIME`
- `3D`
- `REALD 3D`

### Title Cleaning Rules
1. Strip format indicators from beginning or end of title
2. Format names are typically ALL CAPS
3. May appear as suffix: "Dune: Part Two DOLBY"
4. May appear as prefix: "IMAX Dune: Part Two"
5. Remove extra whitespace after stripping

### Examples
| Raw Title | Clean Title | Format Extracted |
|-----------|-------------|------------------|
| `NOSFERATU DOLBY` | `Nosferatu` | Dolby Cinema |
| `Dune: Part Two IMAX` | `Dune: Part Two` | IMAX |
| `REALD 3D Avatar: The Way of Water` | `Avatar: The Way of Water` | RealD 3D |
| `Oppenheimer` | `Oppenheimer` | Standard |
| `THE WILD ROBOT DOLBY` | `The Wild Robot` | Dolby Cinema |

### Title Case Notes
- AMC sometimes uses ALL CAPS for titles
- May need to apply title case normalization
- Be careful with intentional caps (e.g., "WALL-E", "M3GAN")

## Screening Format Detection

| Format String | Meaning |
|---------------|---------|
| `DOLBY` | Dolby Cinema (Dolby Vision + Dolby Atmos) |
| `DOLBY CINEMA` | Same as DOLBY |
| `IMAX` | IMAX presentation |
| `IMAX 3D` | IMAX 3D presentation |
| `PRIME` | AMC Prime (enhanced sound/recliners) |
| `3D` | Standard 3D |
| `REALD 3D` | RealD 3D technology |
| `LASER` | Laser projection (sometimes combined with IMAX) |

## Date/Time Format
- Date format: `January 15, 2025` or `01/15/2025`
- Time format: `7:30 PM` (12-hour with AM/PM)

## Additional Fields
- **Confirmation Number**: Alphanumeric code
- **Theater Location**: Full address typically included
- **AMC Stubs Number**: Member ID (if applicable)
- **Barcode**: For ticket scanning

## Known Issues

### Issue 1: Format in Title
**Problem**: Movie title contains format suffix (e.g., "NOSFERATU DOLBY")
**Impact**: Movie lookup fails or matches wrong film
**Solution**: Strip known format strings before TMDB search

### Issue 2: ALL CAPS Titles
**Problem**: Some titles come through in ALL CAPS
**Impact**: Looks unprofessional, may affect matching
**Solution**: Apply intelligent title case (preserve acronyms)

### Issue 3: Auditorium vs Format Confusion
**Problem**: Auditorium field contains "DOLBY 1" - is "DOLBY" the format or auditorium name?
**Impact**: May double-extract format
**Solution**: Check both title and auditorium for format, deduplicate

## Sample Ticket Data

```
--- Apple Wallet Pass ---
Event: NOSFERATU DOLBY
Date: January 3, 2025
Time: 7:00 PM
Location: AMC Lincoln Square 13
          1998 Broadway
          New York, NY 10023
Seat: Row G, Seat 12
Auditorium: Dolby Cinema 1
Confirmation: ABC123XYZ
```

```
--- Email Confirmation ---
Your AMC Tickets
================
Movie: THE WILD ROBOT DOLBY
Theater: AMC Burbank 16
Date: Friday, October 11, 2024
Showtime: 4:15 PM
Seats: G7, G8
Auditorium: 8
```

## Parsing Pseudocode

```typescript
function cleanAMCTitle(rawTitle: string): { title: string; format: string | null } {
  const formats = ['DOLBY CINEMA', 'DOLBY', 'IMAX 3D', 'IMAX', 'REALD 3D', '3D', 'PRIME'];

  let title = rawTitle.trim();
  let detectedFormat: string | null = null;

  for (const format of formats) {
    // Check suffix
    if (title.toUpperCase().endsWith(` ${format}`)) {
      title = title.slice(0, -(format.length + 1)).trim();
      detectedFormat = format;
      break;
    }
    // Check prefix
    if (title.toUpperCase().startsWith(`${format} `)) {
      title = title.slice(format.length + 1).trim();
      detectedFormat = format;
      break;
    }
  }

  // Apply title case if all caps
  if (title === title.toUpperCase()) {
    title = toTitleCase(title);
  }

  return { title, format: detectedFormat };
}
```

## Notes
- AMC Stubs members may have different ticket formats
- A-List members have subscription info on tickets
- Fathom Events and special screenings may have unique formatting
