# PRD: Smart Ticket Scanning - Theater-Aware Parsing

## Overview
Improve ticket scanning accuracy by detecting the theater chain first, then using theater-specific parsing instructions for Gemini.

## Problem Statement
Current approach sends a generic prompt to Gemini and hopes it can parse any ticket format. This leads to:
- Inconsistent parsing accuracy
- Larger prompts (more tokens = more cost)
- No optimization for common theater formats

## Solution
Two-phase approach:
1. **Detect** the theater chain from the ticket image
2. **Parse** using theater-specific instructions

---

## Theater Chain Priority

### Tier 1: Major US Chains (implement first)
| Chain | US Locations | Notes |
|-------|--------------|-------|
| AMC Theatres | 900+ | Largest US chain |
| Regal Cinemas | 500+ | Second largest |
| Cinemark | 500+ | Third largest |
| Alamo Drafthouse | 40+ | Strong brand loyalty, food service |
| Harkins Theatres | 30+ | Southwest US |

### Tier 2: Regional Chains
- Marcus Theatres (Midwest)
- Showcase Cinemas (Northeast)
- Landmark Theatres (Art house)
- Angelika Film Center (Art house)
- iPic Entertainment (Luxury)

### Tier 3: Specialty/Other
- Drive-ins (various)
- Independent theaters
- International chains (when expanding)

---

## Data Structure: Theater Profiles

```typescript
interface TheaterProfile {
  id: string;
  name: string;
  aliases: string[];           // ["AMC", "AMC Theatres", "AMC CLASSIC"]
  logoPatterns?: string[];     // Keywords/patterns to detect from image
  ticketFormat: {
    movieTitleLocation: string;    // "top", "center", "after_theater_name"
    dateFormat: string;            // "MM/DD/YYYY", "Month DD, YYYY"
    timeFormat: string;            // "12h", "24h"
    seatFormat?: string;           // "Row A Seat 12", "A-12"
    hasQRCode: boolean;
    hasBarcode: boolean;
    specialFields?: string[];      // ["Dolby", "IMAX", "Dine-In"]
  };
  parsingHints: string;           // Specific instructions for Gemini
}
```

### Example: AMC Profile

```typescript
const amcProfile: TheaterProfile = {
  id: "amc",
  name: "AMC Theatres",
  aliases: ["AMC", "AMC CLASSIC", "AMC DINE-IN"],
  logoPatterns: ["AMC", "amc theatres"],
  ticketFormat: {
    movieTitleLocation: "top",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    seatFormat: "Row X Seat Y",
    hasQRCode: true,
    hasBarcode: true,
    specialFields: ["DOLBY CINEMA", "IMAX", "PRIME", "Dine-In Delivery"]
  },
  parsingHints: `
    AMC ticket format:
    - Movie title is in BOLD at the top
    - Theater location follows the movie title
    - Date format: MM/DD/YYYY
    - Time format: HH:MM AM/PM
    - Look for format indicators: DOLBY CINEMA, IMAX, PRIME, 3D
    - Seat info: "Row [letter] Seat [number]"
    - Confirmation code is 10-12 alphanumeric characters
  `
};
```

---

## Implementation Phases

### Phase 1: Theater Detection

**Option A: Text Pattern Matching (simpler)**
```typescript
async function detectTheater(extractedText: string): Promise<TheaterProfile | null> {
  const profiles = await getTheaterProfiles();
  
  for (const profile of profiles) {
    for (const alias of profile.aliases) {
      if (extractedText.toLowerCase().includes(alias.toLowerCase())) {
        return profile;
      }
    }
  }
  
  return null; // Unknown theater, use generic parsing
}
```

**Option B: Two-Stage Gemini (more accurate)**
```typescript
// First, quick detection prompt
const detectionPrompt = `
  Look at this ticket image. Identify the theater chain.
  Respond with ONLY the theater name, or "UNKNOWN" if not recognizable.
  Common chains: AMC, Regal, Cinemark, Alamo Drafthouse, Harkins
`;
```

### Phase 2: Theater-Specific Parsing

```typescript
async function parseTicket(imageBase64: string): Promise<TicketData> {
  // Step 1: Quick text extraction or detection
  const theaterProfile = await detectTheater(imageBase64);
  
  // Step 2: Build targeted prompt
  const prompt = theaterProfile 
    ? buildTheaterSpecificPrompt(theaterProfile)
    : buildGenericPrompt();
  
  // Step 3: Parse with Gemini
  const result = await callGemini(imageBase64, prompt);
  
  return result;
}

function buildTheaterSpecificPrompt(profile: TheaterProfile): string {
  return `
    Parse this ${profile.name} movie ticket.
    
    ${profile.parsingHints}
    
    Extract and return JSON:
    {
      "movieTitle": string,
      "theaterName": string,
      "theaterLocation": string,
      "date": string (ISO format),
      "time": string (HH:MM 24h),
      "format": string | null (IMAX, Dolby, 3D, etc),
      "seat": string | null,
      "confirmationCode": string | null,
      "confidence": number (0-1)
    }
  `;
}
```

### Phase 3: Feedback Loop (future)

- Store successful parses with theater association
- Allow users to correct parsed data
- Use corrections to improve profiles over time

---

## Storage Options for Theater Profiles

### Option A: Hardcoded in App
- Pros: Fast, no network call, works offline
- Cons: Requires app update to add theaters

### Option B: Supabase Table
- Pros: Update without app release, analytics on usage
- Cons: Network dependency

### Option C: Hybrid
- Ship with Tier 1 profiles baked in
- Fetch updates from Supabase on app launch
- Cache locally

**Recommendation:** Start with Option A (hardcoded) for Tier 1 chains, move to Option C when expanding.

---

## Prompt Engineering Notes

**Generic prompt (fallback):**
```
Parse this movie ticket image. Extract:
- Movie title
- Theater name and location  
- Date and time
- Seat information (if visible)
- Any format indicators (IMAX, 3D, Dolby, etc)

Return as JSON. If a field is not visible, use null.
```

**Theater-specific prompts should:**
- Be concise (fewer tokens = cheaper + faster)
- Include specific field locations
- Mention date/time formats used by that chain
- List special terminology (e.g., "PRIME" = AMC's premium large format)

---

## Success Metrics

- **Accuracy**: % of tickets parsed correctly (target: 95%+ for Tier 1 chains)
- **Speed**: Average parsing time (target: <3 seconds)
- **Token usage**: Reduction in prompt size for known theaters
- **Coverage**: % of scanned tickets from known theaters

---

## Testing Plan

1. Collect sample tickets from each Tier 1 chain (5-10 per chain)
2. Test detection accuracy
3. Test parsing accuracy
4. Compare generic vs theater-specific results
5. Measure token usage difference

---

## Timeline

| Task | Estimate |
|------|----------|
| Create Tier 1 theater profiles | 2 hours |
| Implement detection logic | 2 hours |
| Update parsing to use profiles | 3 hours |
| Testing & refinement | 3 hours |
| **Total** | **~10 hours** |

---

## Open Questions

1. Should detection happen on-device (faster) or server-side (more consistent)?
2. Do we need user confirmation of detected theater?
3. How do we handle movie theater apps' digital tickets vs paper tickets?
