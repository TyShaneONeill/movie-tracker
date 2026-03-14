# Gemini Prompts: CineTrak+ Premium Gating UI Mockups

Three detailed prompts for Google Gemini to generate HTML/CSS mockups of the CineTrak+ premium gating UI. Each mockup serves as visual inspiration for the final React Native implementation.

---

## Prompt 1: Paywall / Upgrade Screen

```
Create a standalone HTML/CSS mockup of a mobile paywall screen for a movie tracking app called "CineTrak+". This is the full upgrade screen users see when they navigate to the premium subscription page.

VIEWPORT & FORMAT:
- Mobile viewport: 390x844px (iPhone 14 size)
- Standalone HTML file with all CSS inline or in a <style> tag
- No JavaScript frameworks, no external dependencies
- Use Google Fonts: Inter (400, 500, 600, 700) for body text and Outfit (700, 800) for headings/display text
- Create BOTH a dark mode version and a light mode version, stacked vertically in the same HTML file with a clear label above each

DESIGN SYSTEM — exact color values:

Dark mode:
- Background: #09090b (zinc-950)
- Secondary surface: #18181b (zinc-900)
- Card background: #27272a (zinc-800)
- Primary text: #fafafa (zinc-50)
- Secondary text: #a1a1aa (zinc-400)
- Tertiary text: #71717a (zinc-500)
- Primary accent: #e11d48 (rose-600)
- Accent hover: #be123c (rose-700)
- Success/positive: #10b981 (emerald-500)
- Premium gold: #fbbf24 (amber-400)
- Border: rgba(255, 255, 255, 0.08)

Light mode:
- Background: #f4f4f5 (zinc-100)
- Secondary surface: #e4e4e7 (zinc-200)
- Card background: #ffffff
- Primary text: #18181b (zinc-900)
- Secondary text: #52525b (zinc-600)
- Tertiary text: #a1a1aa (zinc-400)
- Primary accent: #e11d48 (rose-600)
- Accent hover: #be123c (rose-700)
- Success/positive: #10b981 (emerald-500)
- Premium gold: #fbbf24 (amber-400)
- Border: rgba(0, 0, 0, 0.08)

Gradient: linear-gradient from #e11d48 to #be123c (rose gradient)

Spacing scale: 4px, 8px, 16px, 24px, 32px, 48px
Border radius: 8px (sm), 16px (md), 24px (lg), 9999px (full/pill)
Font sizes: 12px, 14px, 16px, 18px, 20px, 24px, 30px, 36px

LAYOUT & CONTENT (top to bottom):

1. HEADER AREA:
   - Close/back button (X icon) in the top-left corner
   - Subtle gradient glow or radial highlight behind the branding area
   - "CineTrak+" in Outfit 800 ExtraBold, 30px, with a subtle gold (#fbbf24) shimmer or gradient effect on the "+" character
   - Tagline below: "Your cinema experience, supercharged" in Inter 400, 16px, secondary text color

2. HERO ILLUSTRATION AREA:
   - A decorative area with abstract cinema-themed shapes (film strip, star, ticket stub silhouettes) rendered in CSS using the rose and gold accent colors
   - Keep it minimal and elegant, not cartoonish

3. FEATURE COMPARISON:
   - Two-column comparison: "Free" vs "CineTrak+"
   - The CineTrak+ column header should have a subtle gold border or background tint
   - Features to list (each row with checkmark or X):
     - Track movies & shows: Free (check), Plus (check)
     - Rate & review: Free (check), Plus (check)
     - Social feed: Free (check), Plus (check)
     - Advanced stats & insights: Free (X), Plus (check, gold)
     - Release calendar filters: Free (X), Plus (check, gold)
     - Ad-free experience: Free (X), Plus (check, gold)
     - Custom journey art: Free (X), Plus (check, gold)
     - Priority support: Free (X), Plus (check, gold)
   - Use emerald (#10b981) for included checks, tertiary text color (#71717a) for X marks
   - Gold (#fbbf24) accent for premium-exclusive check marks

4. PRICING TOGGLE:
   - Pill-shaped segmented control: "Monthly" | "Yearly"
   - Active segment uses the rose gradient background with white text
   - Inactive segment is transparent with secondary text
   - Below the toggle, show the selected price:
     - Monthly: "$3.99/month"
     - Yearly: "$29.99/year" with a badge/callout saying "Save 37%" in emerald (#10b981) on a emerald/10% background
   - Price in Outfit 700 Bold, 36px
   - Period text in Inter 400, 14px, secondary text

5. CTA BUTTON:
   - Full-width button with rose gradient (#e11d48 to #be123c)
   - Text: "Start Free Trial" in Inter 600 SemiBold, 15px, white
   - Height: 52px, border-radius: 9999px (pill shape)
   - Subtle shadow: 0 4px 12px rgba(225, 29, 72, 0.3)
   - Below the button: "7-day free trial, cancel anytime" in Inter 400, 12px, tertiary text

6. FOOTER:
   - "Restore Purchases" link in Inter 500 Medium, 14px, secondary text color, underlined
   - "Terms of Service" and "Privacy Policy" links side by side, same style
   - These should be at the very bottom with comfortable spacing

VISUAL STYLE NOTES:
- The overall feel should be premium and cinematic, like Letterboxd Pro or Spotify Premium upgrade screens
- Use subtle card elevation (box-shadow: 0 4px 6px rgba(0,0,0,0.1)) on the comparison table
- The background should have a very subtle noise texture or radial gradient to avoid feeling flat
- Smooth, rounded corners everywhere (minimum 8px)
- The comparison table should be wrapped in a card with the card background color and border
- Add subtle hover states on interactive elements
- In dark mode, use a faint radial glow of rose (#e11d48 at 5-8% opacity) behind the hero area for depth
```

---

## Prompt 2: Upgrade Prompt Bottom Sheet

```
Create a standalone HTML/CSS mockup of a mobile bottom sheet overlay that appears when a free user taps on a premium-locked feature in a movie tracking app called "CineTrak+". This is a contextual upgrade prompt, not the full paywall.

VIEWPORT & FORMAT:
- Mobile viewport: 390x844px (iPhone 14 size)
- Standalone HTML file with all CSS inline or in a <style> tag
- No JavaScript frameworks, no external dependencies
- Use Google Fonts: Inter (400, 500, 600, 700) for body text and Outfit (700, 800) for headings
- Create BOTH a dark mode version and a light mode version, stacked vertically in the same HTML file with a clear label above each
- Show the bottom sheet overlaying a dimmed/blurred app screen behind it to simulate the real experience

DESIGN SYSTEM — exact color values:

Dark mode:
- Background (behind sheet): #09090b with 50% black overlay
- Sheet background: #27272a (zinc-800)
- Glass effect: rgba(24, 24, 27, 0.7) with backdrop-filter: blur(20px)
- Primary text: #fafafa (zinc-50)
- Secondary text: #a1a1aa (zinc-400)
- Tertiary text: #71717a (zinc-500)
- Primary accent: #e11d48 (rose-600)
- Accent hover: #be123c (rose-700)
- Success: #10b981 (emerald-500)
- Premium gold: #fbbf24 (amber-400)
- Border: rgba(255, 255, 255, 0.08)

Light mode:
- Background (behind sheet): #f4f4f5 with 30% black overlay
- Sheet background: #ffffff
- Glass effect: rgba(255, 255, 255, 0.8) with backdrop-filter: blur(20px)
- Primary text: #18181b (zinc-900)
- Secondary text: #52525b (zinc-600)
- Tertiary text: #a1a1aa (zinc-400)
- Primary accent: #e11d48 (rose-600)
- Accent hover: #be123c (rose-700)
- Success: #10b981 (emerald-500)
- Premium gold: #fbbf24 (amber-400)
- Border: rgba(0, 0, 0, 0.08)

Spacing scale: 4px, 8px, 16px, 24px, 32px, 48px
Border radius: 8px (sm), 16px (md), 24px (lg), 9999px (full/pill)

BACKGROUND LAYER (simulated app screen behind the sheet):
- Show a faded/dimmed version of what looks like a stats screen or calendar screen
- Use placeholder rectangles with zinc-800/zinc-700 colors to simulate cards and content
- Apply a dark overlay (rgba(0,0,0,0.5)) and backdrop-filter: blur(8px) over this layer

BOTTOM SHEET LAYOUT (slides up from bottom):

1. DRAG HANDLE:
   - Centered horizontal bar at the top: 40px wide, 4px tall, border-radius 8px
   - Color: border color (rgba(255,255,255,0.08) in dark mode)
   - 8px top margin

2. FEATURE ICON/ILLUSTRATION:
   - A circular container (64px diameter) centered, with a subtle gold (#fbbf24) gradient border (2px)
   - Inside: a CSS-drawn icon representing "Advanced Stats" — use a simple bar chart made of 3 rectangles in the rose accent color
   - Below the icon circle, a small sparkle/star decoration in gold

3. FEATURE TITLE:
   - "Advanced Stats & Insights" in Outfit 700 Bold, 24px, primary text color, centered
   - Below: "Unlock deeper understanding of your watching habits" in Inter 400, 14px, secondary text color, centered, max 2 lines

4. FEATURE HIGHLIGHTS (3 mini bullet points):
   - Each row: a small emerald (#10b981) checkmark circle (20px) + feature text in Inter 400, 14px
   - Items:
     - "Genre breakdown & viewing trends"
     - "Monthly and yearly watch reports"
     - "Personalized movie recommendations"
   - Left-aligned, with 12px gap between rows
   - Wrapped in a subtle card/container with zinc-900/zinc-200 background and border

5. PRICING LINE:
   - Centered text: "Starting at $3.99/month" in Inter 500 Medium, 16px, primary text
   - Below: "or $29.99/year (save 37%)" in Inter 400, 13px, emerald (#10b981) color

6. CTA BUTTON:
   - Full-width button with rose gradient (#e11d48 to #be123c)
   - Text: "Upgrade to CineTrak+" in Inter 600 SemiBold, 15px, white
   - Height: 52px, border-radius: 9999px (pill)
   - Subtle glow shadow: 0 4px 16px rgba(225, 29, 72, 0.25)

7. SECONDARY LINK:
   - "View all CineTrak+ benefits →" in Inter 500 Medium, 14px, rose accent color (#e11d48), centered
   - 16px below the CTA button

8. BOTTOM SAFE AREA:
   - 24px padding at the bottom (simulating iOS safe area)

VISUAL STYLE NOTES:
- The sheet should have border-top-left-radius: 24px and border-top-right-radius: 24px
- Use the glass effect (backdrop-filter: blur(20px)) on the sheet background for a frosted glass appearance
- The sheet should feel like it naturally belongs in the app — same card/surface colors, same border treatments
- The transition from the dimmed background to the sheet should feel seamless
- Add a subtle border-top on the sheet: 1px solid the border color
- The overall height of the sheet should be approximately 60% of the viewport (not full screen)
- Make sure the dimmed background behind the sheet shows through slightly if using the glass effect
- Keep the design non-intrusive and respectful — this is an interruption, so it should feel helpful, not aggressive
```

---

## Prompt 3: Premium Lock Indicators

```
Create a standalone HTML/CSS mockup showing multiple examples of how premium-locked features appear in different UI contexts within a movie tracking app called "CineTrak+". Show locked states alongside unlocked states for comparison.

VIEWPORT & FORMAT:
- Mobile viewport: 390x844px (iPhone 14 size), but the page can scroll vertically to fit all examples
- Standalone HTML file with all CSS inline or in a <style> tag
- No JavaScript frameworks, no external dependencies
- Use Google Fonts: Inter (400, 500, 600, 700) for body text and Outfit (700, 800) for headings
- Create BOTH a dark mode version and a light mode version, stacked vertically in the same HTML file with a clear label above each
- Each example should be clearly labeled with a heading describing the pattern

DESIGN SYSTEM — exact color values:

Dark mode:
- Background: #09090b (zinc-950)
- Secondary surface: #18181b (zinc-900)
- Card background: #27272a (zinc-800)
- Primary text: #fafafa (zinc-50)
- Secondary text: #a1a1aa (zinc-400)
- Tertiary text: #71717a (zinc-500)
- Primary accent: #e11d48 (rose-600)
- Accent hover: #be123c (rose-700)
- Success: #10b981 (emerald-500)
- Premium gold: #fbbf24 (amber-400)
- Blue accent: #00BFFF
- Border: rgba(255, 255, 255, 0.08)

Light mode:
- Background: #f4f4f5 (zinc-100)
- Secondary surface: #e4e4e7 (zinc-200)
- Card background: #ffffff
- Primary text: #18181b (zinc-900)
- Secondary text: #52525b (zinc-600)
- Tertiary text: #a1a1aa (zinc-400)
- Primary accent: #e11d48 (rose-600)
- Accent hover: #be123c (rose-700)
- Success: #10b981 (emerald-500)
- Premium gold: #fbbf24 (amber-400)
- Blue accent: #00BFFF
- Border: rgba(0, 0, 0, 0.08)

Spacing: 4px, 8px, 16px, 24px, 32px, 48px
Border radius: 8px (sm), 16px (md), 24px (lg), 9999px (full/pill)

EXAMPLE 1: STAT CARD WITH LOCK BADGE
Show two stat cards side by side labeled "Locked" and "Unlocked":

Unlocked version:
- A card (card background color, 16px border-radius, border) containing:
  - Title: "Genre Breakdown" in Outfit 700, 16px, primary text
  - A simple horizontal bar chart showing 3 genres (Action 45%, Drama 30%, Comedy 25%) with rose (#e11d48) colored bars
  - Below the chart: "Based on 47 movies" in Inter 400, 12px, tertiary text

Locked version (same card but with lock treatment):
- Same card layout but the chart bars are rendered in tertiary text color (#71717a) with reduced opacity (0.4)
- A frosted glass overlay covers the bottom 60% of the card: backdrop-filter: blur(4px) with rgba(9,9,11,0.6) in dark / rgba(255,255,255,0.5) in light
- In the center of the blurred area: a small lock icon (CSS-drawn, 16px) in gold (#fbbf24)
- Below the lock: "CineTrak+" text in Inter 600 SemiBold, 11px, gold
- Top-right corner of the card: a small badge/pill (20px height) with gold background, containing a lock icon (10px) — this badge is always visible even without the overlay

EXAMPLE 2: SETTINGS ROW WITH "PLUS" BADGE
Show a settings list with 4 rows. Two rows are free features, two are premium:

Each row structure:
- Left: icon circle (36px, zinc-800/zinc-200 background) with a simple CSS icon
- Center: feature name in Inter 500, 15px + description in Inter 400, 13px, secondary text
- Right: either a toggle switch or chevron arrow

Free rows:
- "Dark Mode" with toggle switch (emerald when active)
- "Notifications" with toggle switch

Premium rows (locked):
- "Custom App Icon" — same layout but with a "PLUS" badge pill next to the feature name
  - Badge: 18px height, padding 0 8px, border-radius 9999px, gold (#fbbf24) background, "PLUS" text in Inter 700, 9px, #09090b (dark on gold), uppercase, letter-spacing 0.5px
  - The toggle or chevron on the right should be replaced with a small lock icon in tertiary color
  - The row should have a subtle gold left border (2px solid #fbbf24) to indicate premium
- "Export Watch Data" — same premium treatment with "PLUS" badge and lock icon

EXAMPLE 3: CALENDAR FILTER WITH LOCK OVERLAY
Show a horizontal scrollable filter bar (like filter chips/tags) for a release calendar:

Unlocked chips (tappable, normal styling):
- "All" — active chip: rose background (#e11d48), white text, Inter 500, 13px
- "Theatrical" — inactive chip: zinc-800/zinc-200 background, secondary text, border
- "Streaming" — inactive chip

Locked chips (premium filter options):
- "My Watchlist" — same chip shape but:
  - Dashed border (1px dashed tertiary color) instead of solid
  - Text in tertiary color with 0.6 opacity
  - A tiny lock icon (10px) inline before the text
  - A micro "PLUS" badge (12px height) positioned at the top-right of the chip, overlapping slightly
- "Friends Watching" — same locked chip treatment

Show both the filter bar in isolation AND a mini preview of a calendar grid below it where the locked filter state is visible in context.

EXAMPLE 4: FEED AD WITH UPGRADE BANNER
Show a social feed section with 2 feed items and an ad card between them:

Feed items (normal, for context):
- Simple feed item card: avatar circle (40px) + username + "rated Movie Title ★★★★" + timestamp
- Use placeholder text and colors, card background, 16px border-radius

Ad card (the one to focus on):
- Same card dimensions as feed items but with a distinct treatment:
  - A placeholder ad area (160px height, zinc-700/zinc-300 background with "Ad" text centered in tertiary color)
  - Below the ad: a banner strip spanning the full card width
  - Banner: subtle gradient background from rgba(251,191,36,0.08) to rgba(251,191,36,0.03) (very faint gold)
  - Banner content: gold sparkle icon (CSS star, 14px) + "Remove ads with CineTrak+" in Inter 500, 13px, gold (#fbbf24) + right-pointing chevron in gold
  - Banner height: 40px, border-top: 1px solid border color
  - The banner should feel tappable (add hover: slightly brighter gold background)

Show side by side or stacked:
- The "with ads" version (as described above)
- The "ad-free" version where the ad card is completely gone and the two feed items are adjacent, with a small subtle message where the ad was: "Ad-free browsing ✓" in emerald (#10b981), Inter 400, 12px (optional, just to show the contrast)

EXAMPLE 5: JOURNEY ART GENERATION LOCK
Show a movie detail card or "journey ticket" with a custom art section:

Unlocked version:
- A ticket-shaped card (16px border-radius, card background) showing:
  - Movie poster placeholder (100px x 150px, zinc-700 with film icon)
  - Movie title: "Inception" in Outfit 700, 18px
  - Rating: "9/10" with a star icon in gold
  - Below: "Journey Art" section with a colorful abstract placeholder (representing AI-generated art)
  - "Generate New Art" button in Inter 500, 13px, emerald background, white text, pill shape

Locked version:
- Same ticket card but the "Journey Art" section shows:
  - A blurred/frosted placeholder (use CSS blur on a gradient)
  - Centered lock icon (24px) in gold
  - "Unlock custom journey art" in Inter 500, 13px, gold, below the lock
  - "Generate New Art" button is replaced with "Upgrade to CineTrak+" in Inter 500, 13px, rose gradient background, white text, pill shape

VISUAL STYLE NOTES:
- All lock icons should be consistent: use a simple CSS-drawn padlock shape or the Unicode character 🔒 styled appropriately (prefer CSS shapes if possible for a cleaner look)
- The gold (#fbbf24) color is the universal premium indicator — use it consistently for all lock badges, premium text, and upgrade hints
- Locked states should look appealing, not broken — users should want to unlock them, not be confused by them
- The blur/frost overlay technique should be used sparingly and tastefully
- Include a small section label above each example: "Pattern 1: Stat Card Lock", "Pattern 2: Settings Row Badge", etc., in Inter 600, 12px, uppercase, letter-spacing 1px, tertiary text color
- Maintain consistent spacing between all examples (32px gap)
- Each example should be wrapped in a container with the secondary surface color and 16px border-radius to visually separate them
```

---

## Usage Notes

- Paste each prompt directly into Google Gemini (gemini.google.com) or Gemini API
- Gemini should produce a complete, self-contained HTML file for each prompt
- Open the output HTML in a browser at 390px width to preview (use Chrome DevTools device mode)
- These mockups are for visual reference only — the final implementation will be in React Native with the actual design system components
- The color values, spacing, typography, and border-radius values in these prompts exactly match the CineTrak design system defined in `constants/theme.ts` and `constants/typography.ts`
