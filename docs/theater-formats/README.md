# Theater Ticket Format Cheat Sheets

This directory contains documentation for parsing movie ticket data from various theater chains. Each theater has unique formatting quirks that affect how we extract movie titles, seat information, and screening formats.

## How to Add a New Theater Chain

1. Create a new file: `{theater-name}.md` (lowercase, hyphenated)
2. Copy the template below
3. Fill in the sections based on actual ticket data you encounter
4. Include real examples when possible (redact personal info)

## Template

```markdown
# {Theater Name}

## Overview
Brief description of this theater chain and any general notes.

## Ticket Sources
- [ ] Apple Wallet
- [ ] Email confirmation
- [ ] Physical ticket scan
- [ ] Theater app screenshot

## Seat Format

| Field | Format | Example | Notes |
|-------|--------|---------|-------|
| Row | | | |
| Seat | | | |
| Auditorium | | | |

### Seat Parsing Notes
- Any special parsing considerations

## Movie Title

### Format Indicators in Title
List any format tags that appear in the movie title field and should be stripped:
-

### Title Cleaning Rules
-

### Examples
| Raw Title | Clean Title | Format Extracted |
|-----------|-------------|------------------|
| | | |

## Screening Format Detection

| Format String | Meaning |
|---------------|---------|
| | |

## Date/Time Format
- Date format:
- Time format:

## Additional Fields
Any other relevant fields this theater includes.

## Known Issues
-

## Sample Ticket Data
```
(Paste anonymized sample data here)
```
```

## Fields to Document

### Seat Information
- **Row**: How is the row identified? Single letter (A-Z), double letter (AA-ZZ), number, or name (Orchestra, Mezzanine)?
- **Seat**: Number format, any prefixes/suffixes
- **Auditorium**: Number, name, or special designation (IMAX, Dolby Cinema, etc.)
- **Combined format**: Does the ticket show "A12" or "Row A, Seat 12"?

### Movie Title Parsing
- **Format indicators**: IMAX, DOLBY, 3D, ATMOS, 4DX, RPX, XD, etc. - where do they appear?
- **Language tags**: Does it include (DUBBED), (SUBTITLED), language codes?
- **Version info**: Director's Cut, Extended Edition, Anniversary, etc.
- **Parenthetical info**: Year, rating, runtime - are these in the title?

### Screening Format
- What premium formats does this chain offer?
- How are they indicated on the ticket?
- Is format in the title, a separate field, or the auditorium name?

### Date and Time
- Date format variations (MM/DD/YYYY, Month DD, etc.)
- 12-hour vs 24-hour time
- Timezone handling

## Directory Structure

```
docs/theater-formats/
├── README.md           # This file
├── amc.md              # AMC Theatres
├── regal.md            # Regal Cinemas
├── cinemark.md         # Cinemark
├── alamo-drafthouse.md # Alamo Drafthouse
└── ...
```

## Contributing

When you encounter a new theater or ticket format:

1. Try to import the ticket
2. Note any parsing failures or incorrect data
3. Document the actual format in the appropriate cheat sheet
4. Include the raw data that caused issues
5. Update the parsing logic if needed

## Quick Reference: Common Format Strings

| String | Meaning | Chains |
|--------|---------|--------|
| IMAX | IMAX format | Most chains |
| DOLBY | Dolby Cinema/Atmos | AMC |
| 3D | 3D presentation | All |
| DBOX | D-BOX motion seats | Various |
| 4DX | 4DX experience | Regal, CGV |
| RPX | Regal Premium Experience | Regal |
| XD | Extreme Digital Cinema | Cinemark |
| PRIME | Prime seating/format | AMC |
| ScreenX | 270-degree screens | Various |
| ATMOS | Dolby Atmos audio | Various |
