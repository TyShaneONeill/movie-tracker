# Ticket Scan v2 — PR 5 Brief: Edit Journey sheet + CompanionPicker

**Goal:** dark-only v2 **Edit Journey bottom sheet** (opened from the journey card's edit pencil) + a v2 **CompanionPicker**, behind `ticket_scan_v2`. **JS-only → OTA-able (NO migration).** Flag-OFF byte-identical (v1 edit route + render path unchanged). Saves via the SAME optimistic `updateJourney` path as v1.

Replaces the edit-pencil's `router.push('/journey/edit/[id]')` (`components/scan-v2/journey-screen.tsx:270`) with an in-screen v2 sheet for the fields below. The v1 edit route stays intact (flag-off, and the "Log another viewing"/new-journey path at `:182` still use it — leave those alone).

Worktree: `/private/tmp/claude-501/-Users-Shared-evermind-tormajs-evermind/54d59c4b-8fc5-4387-ab48-73748bb663dc/scratchpad/pr5-build`. Branch `feature/ticket-scan-v2-edit-journey` (off merged main, incl. PR4).

## Scope (files)
- **NEW** `components/scan-v2/edit-journey-sheet.tsx` — the v2 Edit Journey bottom sheet (operates on `UserMovie`, builds a `JourneyUpdate` patch).
- **NEW** `components/scan-v2/companion-picker.tsx` — dark v2 people picker (mutual-follows search + manual name add).
- **MODIFY** `components/scan-v2/journey-screen.tsx` — swap the edit-pencil `onEdit` (line 270) to open the sheet; render it; wire Save to `updateJourney`.

## Fields (single `user_movies` row; mirror v1 `buildFormData` exactly — `app/journey/edit/[id].tsx:244-258`)
Reuse `edit-sheet.tsx` chrome/patterns (RN `<Modal>` slide + 0.55 scrim + grabber + top-rounded `ScanV2Colors.surface` sheet `maxHeight:'94%'`; keyboard avoidance via `useKeyboardHeight()` + `ensureVisible()` + bottom spacer; `SectionCard`/`EditField`/`DashedBorder`). Drive pickers via the `picker`-state + `<PickerOverlay>` mounted INSIDE the same Modal (pattern at `edit-sheet.tsx:91,98-101,155-191,345-358`).

| Field | Control | Column | Type / normalization |
|---|---|---|---|
| Tagline | text (max 50) | `journey_tagline` | `trim()||null` |
| Notes | multiline (max 500) | `journey_notes` | `trim()||null` |
| Date | `PickerOverlay 'date'` | `watched_at` | ISO via `toISOString()`; **date-only (local midnight)** — PRESERVE v1's two-field split (date→`watched_at`, clock→`watch_time`) |
| Time | `PickerOverlay 'time'` (TimeWheel) | `watch_time` | `"HH:MM"` 24h zero-padded (convert the wheel's `"7:30 PM"` label via `parseTimeLabel`) |
| Cinema/Location | text | `location_name` | `trim()||null` |
| Seat | text | `seat_location` | `trim()||null` |
| Format | `PickerOverlay 'format'` (`FORMATS`) | `watch_format` | **LOWERCASE** enum: `standard|imax|dolby|3d|4k|screenx|4dx` |
| Auditorium | text | `auditorium` | `trim()||null` |
| Ticket price | text decimal-pad, `$` prefix | `ticket_price` | `parseFloat||null` (mask: strip non-`[0-9.]`, ≤1 dot, ≤2 decimals) |
| Ticket ID | text autoCap chars | `ticket_id` | `trim()||null` |
| Companions | **CompanionPicker** | `watched_with` | `string[]` of display names; `length>0 ? array : null` |

**DO NOT include** (deferred/out): rating (not saved via this path — lives in `first_takes`), photos (→ PR6), "first time seeing it" (NO column — needs a migration), AI-poster delete (dev-tier niche).

## CompanionPicker (NEW dark v2)
- Model on `MoviePicker` (`picker-overlay.tsx:233-299`): a dark search field + scrollable results.
- Data: `useMutualFollows(user.id)` → `Profile[]` (mutual = followers∩following; `hooks/use-mutual-follows.ts`). Render each row with the global `<Avatar userId size avatarUrl updatedAt name>` (`components/ui/avatar.tsx` — theme-agnostic, reads fine on dark) + name.
- Search: client-side filter mutual-follows by `full_name`/`username` (reuse `useDebouncedValue` if helpful).
- Manual add: when the query matches nobody, show an "Add '<query>'" affordance → add the trimmed free-text string (behavior ref: `components/social/friend-picker-modal.tsx:75-81`). **Do NOT reuse `FriendPickerModal` directly — it's theme-aware (light-on-dark).**
- On pick emit the DISPLAY NAME string (`full_name || username`) — `watched_with` stores names, no FK. Dedupe by lowercased name (pass current `watched_with` as already-added).
- Selected companions render in the sheet as removable chips (avatar via the `friendAvatarMap` name→avatar pattern at `journey-screen.tsx:107-130`, else name-only; ✕ removes by index — `[id].tsx:358-360`).
- Mount as an overlay inside the sheet Modal (like `PickerOverlay`) or its own dark Modal — match the v2 picker chrome + the gray-foot fix.

## Save path (reuse v1 exactly)
- `useJourneyMutations(journey.tmdb_id).updateJourney({ journeyId: journey.id, data })` — optimistic, **cache keyed by `tmdb_id`** (construct the hook with the journey's real `tmdb_id`, never undefined, or the optimistic patch no-ops). `journey-screen.tsx:42,91` already constructs `useJourneyMutations(parsedTmdbId)` + `updateJourney` — reuse that instance; keep the Save in the screen (pass an `onSave(patch)` up from the sheet) OR pass `updateJourney` down. Your call — keep it clean.
- `data: JourneyUpdate` = the 11 fields above. Mirror v1 normalization (`trim()||null`, lowercase format, `"HH:MM"` time, ISO `watched_at` preserving the date/time split). `journey_updated_at` is stamped by the service (`lib/movie-service.ts:375`) — do NOT set it.
- Haptic on save (`hapticImpact(ImpactFeedbackStyle.Medium)`); close the sheet on success (optimistic → card updates immediately).

## Integration (`journey-screen.tsx`)
- `const [editingJourney, setEditingJourney] = useState<UserMovie | null>(null);`
- Line 270: `onEdit={() => router.push(...)}` → `onEdit={() => setEditingJourney(item.journey)}`.
- Render inside the `ForcedThemeProvider`: `{editingJourney ? <EditJourneySheet journey={editingJourney} onClose={() => setEditingJourney(null)} onSave={(patch) => { updateJourney({ journeyId: editingJourney.id, data: patch }); setEditingJourney(null); }} /> : null}`.

## Reuse map (don't rebuild)
- `picker-overlay.tsx` (`PickerOverlay`, `FORMATS/RATINGS/TICKET_TYPES`), `time-wheel.tsx` (`TimeWheel`, `parseTimeLabel`) — **AS-IS**.
- `edit-sheet.tsx` patterns (modal chrome, picker-wiring, `useKeyboardHeight`, `ensureVisible`, `SectionCard`/`EditField`/`DashedBorder`) — **COPY/adapt** (it's `ProcessedTicket`-bound + has no companions; do NOT import it for journeys).
- `primitives.tsx` (`ScanText`, `Icon`, `PillButton`, `Chip`), `constants/scan-v2-theme.ts` (`ScanV2Colors`/`ScanV2Accent`), `lib/scan-v2/scale.ts` (`s()`), `constants/theme` `Fonts` — **AS-IS**. Wrap every numeric size in `s()`; all text via `ScanText`.
- `avatar-stack.tsx`, `ui/avatar.tsx` — **AS-IS** for people.
- `useMutualFollows`, the `friendAvatarMap`/`resolveCompanions` builder (`journey-screen.tsx:107-130`) — reuse.

## Gotchas (preserve)
- `watch_format` LOWERCASE; `watch_time` `"HH:MM"` 24h; `watched_at` ISO date-only (two-field split — time-of-day lives in `watch_time`, NOT `watched_at`); optimistic cache keyed by `tmdb_id`; `watched_with` = names, dedupe lowercased; price input mask.
- Gray-foot-behind-sheet fix (`picker-overlay.tsx:121-124`) for any content-height v2 sheet so the scrim doesn't show through the bottom-inset gap. Verify on gesture + 3-button nav.
- The journey screen is already wrapped in `ForcedThemeProvider theme="dark"` (PR4) — but the sheet should use `ScanV2Colors` directly regardless.

## Proof-of-work gate
- `npx tsc --noEmit` clean · `npm run lint` 0 errors · `npm test` (full, `--testPathIgnorePatterns '/.worktrees/'`).
- **Flag-off byte-identical** — only the v2 `onEdit` branch + new v2 files change; the v1 edit route + v1 render path untouched.
- **Device QA via OTA**: journey → edit pencil → dark v2 sheet; edit each field (date/time pickers, format radios, text inputs, price mask); CompanionPicker (search mutual-follows, add manual, remove a chip); Save → card reflects changes (optimistic); Cancel discards. No black-bar/dark-on-dark.

## Out of scope → PR 6 / later
Photos add/edit (`journey_photos`, private `journey-photos` bucket, `SignedPhoto` upload via `lib/image-utils.ts pickImage`), "first time seeing it" toggle (new column), AI-poster delete (dev-tier), real scannable barcode.
