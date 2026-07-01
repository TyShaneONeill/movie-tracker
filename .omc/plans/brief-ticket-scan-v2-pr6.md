# Ticket Scan v2 — PR 6 Brief: Photos in the Edit sheet + Create flow on the v2 sheet (parity)

**Goal:** bring the v2 Edit Journey experience to full parity with the old v1 flow, behind `ticket_scan_v2`. Two coupled pieces:
1. Add a **"Memories / Add photos"** section to the v2 `EditJourneySheet` (port v1's photo upload/delete + grid).
2. Wire the **create-new-journey** flow ("Log another viewing", swipe-right) to open that same v2 sheet — instead of routing to the v1 `/journey/edit/new`.

**JS-only → OTA-able (no migration).** Flag-OFF byte-identical. Worktree: `…/scratchpad/pr6-build` (branch `feature/ticket-scan-v2-photos-create`, off merged main incl. PR5).

Scope (files): **MODIFY** `components/scan-v2/edit-journey-sheet.tsx` (photos) + `components/scan-v2/journey-screen.tsx` (create wiring + delete-on-cancel). No new files. No `JourneyUpdate`/service/hook changes (reuse `useCreateJourney`, `useJourneyMutations`).

---

## Part 1 — Photos in `EditJourneySheet`

Port the v1 photo logic from `app/journey/edit/[id].tsx` (lines 177-231, 441-516). Add a `<SectionCard title="Memories">` (model the body on the existing "Who was there" custom section ~369-401 — a horizontal row of tiles + an add control).

**State** (seed from the journey): `const [localPhotos, setLocalPhotos] = useState<string[]>(journey.journey_photos ?? [])`, `const [isUploading, setIsUploading] = useState(false)`, `const [photoEditMode, setPhotoEditMode] = useState(false)`.

**Add** — port `handleAddPhoto` verbatim (v1 :177-222):
- `const result = await pickImage();` (from `@/lib/image-utils` — square 1:1 crop, quality 0.8; returns `{uri,...}|null`).
- Path: `` `${user?.id}/${journey.id}/${Date.now()}.jpg` `` — **use `journey.id`** (the v2 sheet's `journey` prop; real row id — see Part 2 for create mode, where the row is created BEFORE the sheet opens so `journey.id` is always valid).
- Native: `expo-file-system/legacy` `readAsStringAsync(uri, {encoding: Base64})` → `atob` → `Uint8Array` → `.buffer`. Web: `fetch(uri).arrayBuffer()`.
- `supabase.storage.from('journey-photos').upload(path, body, { contentType:'image/jpeg', cacheControl:'86400', upsert:false })`.
- On error: `captureException(err, { context:'journey-photo-upload' })` + `Toast.show({type:'error', text1:'Upload failed', ...})`.
- `const { data } = supabase.storage.from('journey-photos').getPublicUrl(path); setLocalPhotos(prev => [...prev, data.publicUrl]);`

**Delete** — port `handleDeletePhoto` (v1 :225-231): optimistic remove from `localPhotos`, then `supabase.storage.from('journey-photos').remove([photoUrl.split('/journey-photos/')[1]]).catch(()=>{})`.

**Grid UI** (v2-styled, dark via `ScanV2Colors`): a horizontal `ScrollView` of tiles (~`s(100)`×`s(140)`, `borderRadius s(10)`):
- Each tile: `<SignedPhoto expoImage uri={photoUrl} style={{...absoluteFill}} contentFit="cover" transition={200} />` (from `@/components/journey/signed-photo`). In `photoEditMode`, an ✕ badge (top-right) → `handleDeletePhoto`.
- Add tile: a dashed/`ScanV2Colors.field` tile with a `plus` Icon; `<ActivityIndicator>` (ScanV2Accent.primary) while `isUploading`; hidden in edit mode. Tapping → `handleAddPhoto`.
- A small "Edit"/"Done" toggle (flips `photoEditMode`) shown only when `localPhotos.length > 0`. Subtitle text: "Add photos of your ticket, poster, or friends. First photo is the cover."
- **Skip the AI-poster tile** (v1 :469-489) — in v2 the AI poster is managed by the journey card's Original/AI toggle + the AI-generation button, not the edit sheet.

**Save patch** — add ONE line to `handleSave` (after `watched_with`): `journey_photos: localPhotos.length > 0 ? localPhotos : null,` and add `localPhotos` to the `useCallback` deps. **Do NOT add `cover_photo_index`** (not in `JourneyUpdate`, not written by v1; cover = index 0 implicitly).

**New imports** for the sheet: `ActivityIndicator` (rn), `Platform` (rn), `Toast` (`react-native-toast-message`), `* as FileSystem from 'expo-file-system/legacy'`, `{ supabase } from '@/lib/supabase'`, `{ captureException } from '@/lib/sentry'`, `{ pickImage } from '@/lib/image-utils'`, `{ SignedPhoto } from '@/components/journey/signed-photo'`. (`useAuth` already imported for `user.id`.)

---

## Part 2 — Create flow → v2 sheet (with clean cancel)

Currently `journey-screen.tsx` `handleCreateJourney` (~181-186) routes to `/journey/edit/new?tmdbId=…`. Replace with **create-the-row-first, then open the already-mounted `EditJourneySheet`** on it (the sheet stays a pure `UserMovie`-in/`patch`-out component; the photo upload needs a real `journey.id`, which only exists after the create RPC).

1. `const { createJourney, isCreating } = useCreateJourney();` (from `@/hooks/use-journey`). Also get the **delete** mutation for cancel cleanup — find it in `useJourneyMutations` / `hooks/use-journey.ts` / `lib/movie-service.ts` (the v1 edit screen deletes journeys; reuse that path). Call it `deleteJourney`.
2. `const [pendingCreateId, setPendingCreateId] = useState<string | null>(null);`
3. Rewrite `handleCreateJourney` (keep `requireAuth`): guard `if (!journeys[0]) return;` → `try { const newJourney = await createJourney(journeys[0]); setPendingCreateId(newJourney.id); setEditingJourney(newJourney); } catch { Toast error }`. (`journeys[0]` is the metadata template — `createNewJourney`'s RPC `create_journey_with_next_number` derives movie identity + the next `journey_number` from it; all editable fields start null — exactly what the sheet seeds blank from.) Show a spinner on the "Log another viewing" card while `isCreating`.
4. **Clean cancel (preserve v1 behavior — v1 only persists on Save):** the `EditJourneySheet`'s `onSave` means "saved" → clear `pendingCreateId` (keep the row). `onClose` means "cancel" → if `pendingCreateId === editingJourney?.id` (a freshly-created, never-saved row), `deleteJourney(pendingCreateId)` so no empty journey is left behind. Always then clear both states. Concretely:
   - `onSave={(patch) => { updateJourney({ journeyId: editingJourney.id, data: patch }).catch(() => Toast.error); setPendingCreateId(null); setEditingJourney(null); }}`
   - `onClose={() => { if (pendingCreateId && editingJourney && pendingCreateId === editingJourney.id) { deleteJourney({ journeyId: pendingCreateId }).catch(() => {}); } setPendingCreateId(null); setEditingJourney(null); }}`
   - (Uploaded photos orphaned on cancel = same as v1's pre-existing behavior; acceptable.)
5. The EDIT-pencil path (`onEdit={() => setEditingJourney(item.journey)}`) leaves `pendingCreateId` null, so `onClose` never deletes a real journey. Verify this invariant.

---

## Reuse / gotchas
- Reuse `SignedPhoto` for display (signs the private-bucket URL; renders null until resolved — no 404 flash). Store the PUBLIC url in `journey_photos` (re-signed at display).
- Dark via `ScanV2Colors`/`s()`/`ScanText` (the sheet is dark in PR6; PR7 makes it theme-aware separately — don't theme here).
- `pickImage` already handles the permission prompt; no extra perms code.
- `deleteJourney` MUST exist before wiring cancel-delete — if `useJourneyMutations` has no delete, find the v1 delete path (`app/journey/edit/[id].tsx` delete-confirmation) and reuse the same service/mutation. Do not invent a new one.

## Proof-of-work gate
- `npx tsc --noEmit` clean · `npm run lint` 0 · `npm test` (full, `--testPathIgnorePatterns '/.worktrees/'`).
- **Flag-off byte-identical** (only the 2 v2 files change; v1 edit/create route untouched).
- **Device QA via OTA**: (a) edit a journey → Memories section → add a photo (uploads, tile shows), toggle edit → delete it; Save → `journey_photos` persists. (b) swipe-right "Log another viewing" → the v2 sheet opens on a new blank journey → fill fields + add a photo → Save → new journey appears in the carousel with the data/photo. (c) swipe-right → Cancel immediately → NO empty journey is left in the carousel (row deleted).

## Out of scope (still deferred)
"First time seeing it" toggle (needs a column), real scannable barcode, explicit cover-photo selection (cover stays index 0). Theme-awareness = PR 7.
