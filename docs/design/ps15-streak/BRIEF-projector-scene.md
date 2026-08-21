# PS-15 · Streak projector scene — implementation brief

**Visual reference (the acceptance spec):**
https://claude.ai/code/artifact/f6e2fe06-56e2-4724-bba5-6f2d556688ca

Open it, set the sliders to the contract below, and match what you see. The
artifact's **Export** panel prints the live contract — if you change anything,
re-copy from there rather than editing numbers by hand in the code.

---

## What this is

The flat streak camera becomes a **solid** in an axonometric room. A projector
on a tripod throws a beam; the streak numeral sits in that beam. The lamp
flickers. The numeral rolls when the day turns over.

This replaces the hero band's flat camera + numeral. **It does not touch the
streak data layer, the calendar, the tabs, or the message card.**

---

## The contract

```
streak camera · axonometric
  azimuth        34°   (90 = pure profile, <90 turns the lens toward the viewer)
  elevation      8°
  body width     47 artwork units
  face matrix    matrix(0.55919,-0.11538,0,0.99027,0,0)
  depth step     (-1.4826, -0.2513) per unit
  lens origin    7.5% / 63% of camera-active.svg
  beam axis      161.7°  <- derived, never authored
  cone spread    ±33°
  tilt           -4°  (the projector being aimed)
  number         124px down the beam, 124pt  -> floats in front of the couch
  backlight      extrude @ 39%
  flicker        on · 4.3s, hard cuts
  camera         0.40x at x=300px, 98 nodes, 13 extrusion steps
  light          intensity 76%, atmospheric falloff 30%
  tripod         90px
  mirror         throws left
  room           horizon 338, couch 0.46x, rug 27%, ambient 0%
```

Scene coordinate space is **390 × 660**. All px values above are in that space.

---

## The projection, in full

Everything is authored in the **original 200×160 artwork space** of
`camera-active.svg`. No coordinate in that file changes. Two angles plus a
mirror collapse into one matrix.

Given azimuth `φ`, elevation `ε`, mirror `f` (−1 = throws left), and a point
`(X, Y, Z)` — `X` along the artwork, `Y` across its depth, `Z` down the artwork:

```
sx = f · (−X·sinφ + Y·cosφ)
sy = −X·cosφ·sinε − Y·sinφ·sinε + Z·cosε
```

Because `sx` has no `Z` term this reduces to a single matrix for the near face:

```
matrix(−f·sinφ, −cosφ·sinε, 0, cosε, 0, 0)
```

and the depth sweep reduces to a constant **local** (pre-matrix) offset per unit
of depth:

```
u = −cosφ / sinφ
v = −tan(ε) / sinφ
```

The mirror cancels out of `u` and `v` — it lives entirely in the matrix.

**Tilt** (the projector being aimed) is a rotation in the artwork's own plane,
applied *before* the projection and *inside* the depth offset:

```
transform="translate(u·d·t, v·d·t) rotate(τ, 100, 100)"
```

Rotation centre is artwork `(100, 100)`. Order matters: tilt happens in artwork
space, **then** the depth sweep in projected-local space.

**The beam axis is derived, never authored:**

```
dX = −cos τ,  dZ = −sin τ
axis = atan2(−dX·cosφ·sinε + dZ·cosε,  f·(−dX·sinφ))
```

This is the whole point of the rebuild. The lens origin and the beam direction
come from the same two angles, so they cannot disagree. **Do not add a separate
beam-angle constant.** A previous round shipped a bug where the beam fired 90°
off the lens axis precisely because direction was hardcoded while origin was
derived.

### Building a solid

For each volume: emit `N` stacked copies of the shape from far to near, stepping
the local offset from `u·d, v·d` down to zero. All copies share **one**
`userSpaceOnUse` linear gradient running along the sweep vector, so the shading
is a lit surface rather than per-step banding. The gradient vector must be
**counter-rotated by −τ**, because it lives in the shape's own tilted space.

Far end colour = base lightened ~19%, then mixed toward `#09090b` by the
atmospheric-falloff amount.

---

## Layer order — back to front

The beam axis is **161.7°**, which has a downward component: the projector is
throwing *toward the viewer*, so the number is the **nearest object in the
frame**, not something painted on the back wall. That fixes the paint order:

1. Wall
2. Floor, then rug
3. Couch (behind the number, in silhouette)
4. Tripod, then the camera solid
5. Beam — volumetric, over the room but under nothing else
6. Lens glow
7. **Vignette**
8. **The numeral, last of all**

Two of these are counter-intuitive and both were bugs during design:

- **The vignette paints before the numeral.** The number is landing on the
  phone's glass — nearer than the room — so the room's falloff must not dim it.
  Paint it after the number and the number goes grey.
- **The couch must be darker in value than the wall behind it.** Everything in
  the room is backlit, so the room reads as silhouettes against a lit surface.
  Build the couch as "furniture lit from the front" and it glows brighter than
  the wall and becomes the hero of the frame.

The beam, the lens glow and the numeral share **one** flicker value (trap 6).

---

## Where it goes

| Path | What to do |
|---|---|
| `components/streak/streak-camera.tsx` | Extend. Already renders the identical 200×160 coordinates (reels at `156,46 r27` / `96,42 r32`, lens at `15,101`). The isometric build is an evolution of this file, not a new one. |
| `app/streak.tsx` | Hosts the hero. **`HERO_HEIGHT` is currently 210** — the scene is 660 tall. See "Open question" below. |
| `docs/design/ps15-streak/design_handoff_streak_camera/assets/camera-active.svg` | Source of truth for artwork coordinates and palette. Unchanged. |
| `constants/streak-theme.ts` | All chrome colour tokens. Do not introduce new hexes for anything the tokens already cover. |

Available deps: `react-native-svg ^15.15.1`, `react-native-reanimated ~4.1.1`,
`expo-blur ^15.0.8`. No new dependencies without asking.

---

## Traps — read before writing code

1. **The chosen backlight is filter-free, and that is deliberate.** `extrude`
   is offset `<Text>` copies with no blur, so it renders identically on both
   platforms. The `halo` and `silhouette` treatments need a real Gaussian blur
   and land straight back in the Android `feGaussianBlur` divergence that caused
   PR #833. **Do not "improve" extrude into a blurred glow.**

2. **`feGaussianBlur` in `react-native-svg` is unreliable on Android.** Any soft
   light in the scene (beam edges, lens bloom) must be built from **geometry and
   gradients**, not filters — same resolution as #833's `NumeralHalo`. A radial
   gradient behind the lens beats a blur filter on the lens.

3. **The room is a mock, not a shipping asset.** Couch, rug, tripod and wall
   exist to prove the concept reads. Ship them as **one exported raster
   backdrop**; composite only the camera, the beam and the numeral live. Vector
   for the room buys nothing and costs a few hundred nodes on every open.

4. **The numeral stays native `<Text>`.** Extrude = absolutely-positioned copies
   at a computed offset along the depth axis. Set an explicit `lineHeight` and
   `fontVariant: ['tabular-nums']` — Outfit clips without one, and the columns
   shift width mid-roll without the other.

5. **Flicker must run on the UI thread.** One
   `withRepeat(withSequence(...))` in Reanimated. A `setInterval` flicker is a
   JS-thread animation and will stutter under Metro, list rendering, or a cold
   TTI. It also makes cancellation a single `cancelAnimation` instead of orphaned
   timers.

6. **Flicker drives beam, lens glow and numeral as one shared value.** A beam
   that stutters while its own glow holds steady reads as two separate lights.

7. **Hard cuts, not a fade.** The flicker uses step easing on an irregular beat.
   Evenly spaced flicker reads as a broken loop; a soft fade reads as a dimmer,
   not a shutter.

8. **The spool groups must stay named and separately transformable.**
   `#spoolA` / `#spoolB` rotate about their reel centres *inside* the matrix —
   the parent applies the shear, so the rotation does not need re-solving in
   isometric space.

9. **Respect `AccessibilityInfo.isReduceMotionEnabled`** — no flicker, no roll,
   render the lit end state.

---

## Acceptance

- [ ] Renders at the contract values above and visually matches the artifact.
- [ ] Beam origin **and** direction both derived from `(φ, ε, τ)`. No hardcoded
      beam angle anywhere. Changing azimuth in a test moves both together.
- [ ] Verified on **both** an iOS simulator and an Android emulator, dark and
      light, side by side. Platform divergence in soft-light rendering is the
      known failure mode on this screen.
- [ ] Reduce Motion renders the static lit state.
- [ ] `npm run lint && npx tsc --noEmit && npm test` all clean.
- [ ] Branch + PR. Never commit to `main`.

---

## Open question — settle before building

`HERO_HEIGHT` is 210px; the scene is designed at 660. Options:

- **A** — full-bleed background behind the whole streak screen, with the
  existing chrome layered on top.
- **B** — a taller hero band, pushing the calendar down.
- **C** — keep it to the celebration takeover only, leaving the resting streak
  screen's flat hero as-is.

**C is the smallest sane first PR** and is my recommendation: the scene is a
celebration moment, and the resting screen doesn't need a projector running.
Ask before assuming otherwise — this is a product call, not a technical one.

## Also flag before building

Azimuth is at **34°, the floor of the range.** It still reads as a camera, but
there is no headroom: any revision to `camera-active.svg` that thins the
silhouette will tip it into an unrecognisable lozenge. If the artwork is ever
revised, re-check this frame first.
