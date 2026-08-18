# Handoff: Streak Screen — Camera Icon & States

## Overview
A redesigned streak screen hero for PocketStubs (movie-logging app). The centerpiece is a flat, layered film-camera mark with three states: **idle** (not done today, zinc silhouette), **active** (daily streak done, rose + warm projector light), **milestone** (every 30 days, gold + ring + sparks). In active/milestone the camera's lens hides a light source that casts a beam leftward, lighting up the streak number.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. Recreate them in the app's existing environment (Expo / React Native, using the PocketStubs design-system tokens and `react-native-svg`) following its established patterns. Do not ship the HTML.

## Fidelity
**High-fidelity.** Colors, geometry, typography, and spacing are final. Recreate pixel-perfectly with the codebase's tokens (`Colors`, `Fonts`, `Spacing` from the PocketStubs design system).

## Files
- `Streak Screen Mockups.dc.html` — canvas with option cards. **1a (twin-reel) is the chosen direction**; the full-screen mock is card `1d`. Cards 1b (projector) and 1c (reel-head) were explorations — ignore unless revisiting.
- `StreakCamera.dc.html` — the camera as a self-contained component (template + palette logic). Props: `state: 'idle'|'active'|'milestone'`, `variant` (use `'reel'`), `beam: boolean`.
- `assets/camera-idle.svg`, `assets/camera-active.svg`, `assets/camera-milestone.svg` — the final camera baked per state (viewBox `0 0 200 160`), directly usable as reference geometry.

## The camera (variant "reel") — geometry
ViewBox `0 0 200 160`, lens pointing left, lens optical axis at `y=100`. Paint order matters (flat fills, no strokes except the milestone ring). All shapes rounded.

| # | Part | Shape | Fill role |
|---|------|-------|-----------|
| 1 | Milestone ring | circle (118,84) r72, stroke-width 3, no fill | `ring` (milestone only) |
| 2 | Sparks | 3 diamonds (~10–12px) at (52,16)(190,51)(44,133) + dots r3 (152,4), r2.5 (196,120) | `spark` (milestone only) |
| 3 | Back reel | circle (156,46) r27; inner r17; 3 holes r4.5 at (156,37.5)(148.6,50.25)(163.4,50.25); hub r3 | `reelB` / `reelIn` / `holes` |
| 4 | Front reel | circle (96,42) r32; inner r20; 3 holes r5 at (96,32)(87.3,47)(104.7,47); hub r3.5 | `reelA` / `reelIn` / `holes` |
| 5 | Body | rect (56,62) 136×84 rx24 | `body` |
| 6 | Vent panel | rect (104,78) 64×46 rx13 — layered **under** the bottom band | `mount` (the gray/state-tinted depth piece) |
| 7 | Vent slats | rects (116,89) and (116,102), 40×7 rx3.5 | `body` (punch-through) |
| 8 | Bottom band | rect (56,118) 136×28 rx14 | `bodySh` |
| 9 | Lens collar | rect (50,78) 20×40 rx8 (junction step between body and barrel) | `lens` |
| 10 | Lens barrel | rect (20,86) 42×30 rx8 | `lens` |
| 11 | Lens face | rect (6,80) 18×42 rx9 | `face` |
| 12 | Record dot | circle (172,128) r6 | `dotc` |
| 13 | **Hidden light source** (active/milestone only) | halo circle (15,101) r13, blur 7px, fill `glowHalo`; core circle (15,101) r6 white; flare rect (0,99) 32×4 rx2 white 85%, blur 3px | — |

Whole-camera glow: CSS `drop-shadow(0 6px 24px rgba(225,29,72,.35))` in active, `drop-shadow(0 6px 26px rgba(251,191,36,.35))` in milestone, none idle.

## State palettes
| Role | Idle | Active (rose) | Milestone (gold) |
|------|------|---------------|------------------|
| body | #2c2c33 | #e11d48 (tint) | #f59e0b |
| bodySh | #242429 | #be123c | #d97706 |
| reelA (front) | #3f3f46 | #f43f5e | #fbbf24 |
| reelB (back) | #37373e | #be123c | #d97706 |
| reelIn (film) | #1b1b1f | #1c1017 | #241703 |
| holes/hubs | #52525b | #fda4af | #fde68a |
| lens + collar | #37373e | #9f1239 | #b45309 |
| face | #4a4a52 | #ffe4e6 | #fef3c7 |
| dotc | #4a4a52 | #fecdd3 | #fde68a |
| mount (vent panel) | #52525b | #d4d4d8 | #fde68a |
| glowHalo | — | #ffdcc2 | #ffe58f |
| ring / spark | — | — | #fbbf24 / #fde68a |

Design intent: the near-black film discs inside the reels keep the active state from reading "all red"; the panel/collar grays add hardware depth; milestone swaps every rose role for gold and turns the vent panel light-gold so it glows.

## The beam (active/milestone)
Rendered as two layers behind the camera, in front of the screen background, **under the number**:
1. Main cone — `linear-gradient(to left, beamA, beamB 55%, transparent 92%)`, `clip-path: polygon(100% 45%, 100% 55%, 0 0, 0 100%)`, `blur(2px)`.
2. Hot core — `linear-gradient(to left, rgba(255,255,255,.5), transparent 72%)`, `clip-path: polygon(100% 47%, 100% 53%, 0 26%, 0 74%)`, `blur(7px)`.

Colors: active `beamA rgba(255,222,196,.55)`, `beamB rgba(255,222,196,.14)`; milestone `beamA rgba(255,224,138,.6)`, `beamB rgba(255,224,138,.16)`.
Alignment rule: the beam is a 150px-tall box whose **narrow end is vertically centered on the lens axis** (viewBox y=100; at the mock's 0.85 render scale that is container-center + 17px). Its right edge tucks ~5px under the lens barrel so the origin stays hidden; it widens to full height at the left edge of the screen. In the HTML mock: `left:0; right:172px; top:50%; height:150px; transform:translateY(calc(-50% + 17px))`.

## Hero layout (393pt-wide screen)
- Container: 210pt tall, camera SVG 170×136 anchored right with 14pt inset, vertically centered.
- Number block: absolute left 24pt, vertically centered, above the beam.
- Number: `Outfit_800ExtraBold` 88px, line-height 1 (58px in the compact option cards).
  - Idle: `#a1a1aa`, no glow. Sub "day streak" `Inter_400Regular` 15px `#52525b`.
  - Active: `#ffffff` with `text-shadow: 0 2px 34px rgba(255,205,160,.55), 0 0 90px rgba(255,170,110,.3)`. Sub `#a1a1aa`.
  - Milestone: gradient text `linear-gradient(180deg,#ffffff,#fde68a)` (background-clip:text) with wrapper `drop-shadow(0 0 28px rgba(251,191,36,.4))`; sub row adds a MILESTONE chip: `JetBrainsMono_500Medium` 8px, letter-spacing .12em, color #fbbf24, padding 2.5px 6px, border 1px rgba(251,191,36,.45), background rgba(251,191,36,.1), radius 5px.

## Full screen (card 1d) — top to bottom on #09090b
1. **Header**: 24px close ✕ (stroke #71717a, width 2) left; centered "Streak" `Outfit_700Bold` 19px #fafafa. Padding 20px 20px 4px.
2. **Tabs**: pill 46px, radius 23, bg #101013, border 1px #1f1f24, inner padding 3px. Active segment bg #232329 radius 20, `JetBrainsMono_500Medium` 10.5px ls .18em #fafafa "PERSONAL". Inactive #4a4a52 "FRIENDS" + "SOON" chip (7.5px, border #2c2c33, radius 5).
3. **Hero** (above) + **message card**: margin 8px 20px 0, bg #131316, border #1f1f24, radius 14, padding 13px 16px, `Inter_400Regular` 13.5/1.5 #a1a1aa, lead span `Inter_600SemiBold` #fafafa. Copy verbatim:
   - Idle: **"No scene shot today."** " One take keeps the reel alive."
   - Active: **"Day 12, in the can."** " The camera keeps rolling."
   - Milestone: **"Day 30, that's a wrap on a full month."** " Saved to your reel."
4. **Month nav**: 34px circle buttons (border #1f1f24, chevrons #71717a); "August 2026" `Outfit_700Bold` 17px #fafafa.
5. **Stat chips**: two equal pills 44px, radius 22, bg #0f0f12, border #1f1f24; number `Outfit_700Bold` 13.5px #fafafa + label `JetBrainsMono_500Medium` 9.5px ls .12em #71717a ("15 DAYS ACTIVE", "1 RAIN CHECK BANKED").
6. **Calendar**: weekday row S M T W T F S `JetBrainsMono_500Medium` 9.5px #52525b; 7-col grid, 36px rows, 6px row gap. Streak runs are contiguous pills: bg `rgba(225,29,72,.13)` (deliberately muted — not solid red), end caps radius 18, day text `Inter_600SemiBold` 13px #fecdd3. Milestone day: 34px circle, `linear-gradient(180deg,#fbbf24,#f59e0b)`, text #451a03 `Outfit_700Bold` 13.5px, ring `box-shadow: 0 0 0 2px #09090b, 0 0 0 3.5px rgba(251,191,36,.55), 0 0 18px rgba(251,191,36,.35)`, sitting inside the run's last cell. Off days #3f3f46 `Inter_500Medium` 13px.
7. **Footnote**: centered `JetBrainsMono_400Regular` 9px ls .14em #3f3f46.

## Interactions & Behavior
- State transitions: idle → active when today's log is saved; active → milestone on every 30th day. Suggested reveal: fade/scale the glow + beam in (~400ms ease-out) and swap palettes; number glow animates with the beam.
- Beam is a display-only effect; it should be toggleable (reduced-motion / performance fallback = static glow, no beam).
- Tabs: FRIENDS is disabled (SOON). Month chevrons page the calendar.

## State Management
`streakCount: number`, `todayLogged: boolean`, `isMilestone = todayLogged && streakCount % 30 === 0`, `rainChecksBanked: number`, per-month `activeDays: Set<date>`. Camera state derives: `!todayLogged ? 'idle' : isMilestone ? 'milestone' : 'active'`.

## Design Tokens (PocketStubs)
- Background #09090b; cards #131316/#0f0f12; borders #1f1f24; text #fafafa / #a1a1aa / #52525b / #3f3f46.
- Accent rose `Colors.dark.tint` #e11d48 (+ rose scale above); gold `Colors.dark.gold` #fbbf24 (+ amber scale above).
- Fonts: `Fonts.outfit.extrabold` (Outfit_800ExtraBold) display numbers; Outfit_700Bold headings; Inter 400/500/600 body; `Fonts.mono` (JetBrainsMono 400/500) metadata microcopy, letter-spaced uppercase.
- Radii: pills 18–23, cards 14, camera shapes 7–24 (see geometry table).

## Implementation notes (React Native)
- Build the camera with `react-native-svg`; pass one `palette` object per state (roles above) instead of CSS vars. Blur: `feGaussianBlur` filters or pre-blurred radial-gradient images; the whole-camera drop-shadow can be omitted on Android if costly.
- Beam: a `Svg` polygon with `LinearGradient` fill (or two absolutely-positioned gradient Views with `transform` skew) behind the number's Text.
- Milestone gradient number: `MaskedView` + `LinearGradient`, or fall back to solid #fde68a.

## Assets
No raster assets. All imagery is the SVG geometry in `assets/` (authored for this design; no third-party icons).
