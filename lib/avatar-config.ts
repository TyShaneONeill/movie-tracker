/**
 * PocketStubs customizable avatar system (Duolingo-style).
 *
 * Vector avatars are generated with DiceBear's `avataaars` style and rendered
 * as plain SVG (no CSS <style> blocks => safe for react-native-svg's SvgXml).
 *
 * Design intent:
 * - Every account gets a friendly, deterministic avatar seeded from its user id
 *   ("auto" mode) with zero database writes. Customization (Phase 2) layers a
 *   stored `AvatarConfig` on top of the same seed.
 * - This file is the ONLY place that knows about DiceBear. The rest of the app
 *   talks to `<Avatar>` / `avatarSvg()` so the underlying art set can be swapped
 *   or expanded (incl. a bespoke/AI-generated set) without touching callers.
 *
 * Catalogs below are curated subsets for v1 — the option arrays are the
 * expansion lever (DiceBear exposes far more values than we expose here).
 */
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

/** How a profile's avatar should be resolved. Phase 2 persists this on `profiles`. */
export type AvatarType = 'auto' | 'preset' | 'photo' | 'initial';

/**
 * A user's avatar customization. Each value is a DiceBear `avataaars` option id
 * (hex colors are stored WITHOUT a leading '#'). All fields optional — anything
 * omitted falls back to a deterministic choice derived from the seed.
 */
export interface AvatarConfig {
  skinColor?: string;
  top?: string; // hair style
  hairColor?: string;
  clothing?: string;
  clothesColor?: string;
  eyes?: string;
  backgroundColor?: string;
}

export interface AvatarOption {
  id: string;
  label: string;
}
export interface ColorOption {
  id: string; // hex without '#'
  label: string;
}

// ---------------------------------------------------------------------------
// Catalogs (v1 curated subsets). `id`s map 1:1 to DiceBear avataaars values.
// ---------------------------------------------------------------------------

export const SKIN_TONES: ColorOption[] = [
  { id: 'ffdbb4', label: 'Light' },
  { id: 'edb98a', label: 'Fair' },
  { id: 'f8d25c', label: 'Warm' },
  { id: 'fd9841', label: 'Tan' },
  { id: 'd08b5b', label: 'Medium' },
  { id: 'ae5d29', label: 'Brown' },
  { id: '614335', label: 'Deep' },
];

export const HAIR_STYLES: AvatarOption[] = [
  { id: 'shortFlat', label: 'Short' },
  { id: 'shortWaved', label: 'Waved' },
  { id: 'shortCurly', label: 'Curly' },
  { id: 'theCaesar', label: 'Caesar' },
  { id: 'shavedSides', label: 'Shaved sides' },
  { id: 'fro', label: 'Fro' },
  { id: 'dreads01', label: 'Dreads' },
  { id: 'curly', label: 'Coils' },
  { id: 'bob', label: 'Bob' },
  { id: 'bun', label: 'Bun' },
  { id: 'longButNotTooLong', label: 'Long' },
  { id: 'straight01', label: 'Straight' },
  { id: 'miaWallace', label: 'Blunt' },
  { id: 'hijab', label: 'Hijab' },
];

export const HAIR_COLORS: ColorOption[] = [
  { id: '2c1b18', label: 'Black' },
  { id: '4a312c', label: 'Dark brown' },
  { id: '724133', label: 'Brown' },
  { id: 'a55728', label: 'Auburn' },
  { id: 'b58143', label: 'Light brown' },
  { id: 'd6b370', label: 'Blonde' },
  { id: 'c93305', label: 'Red' },
  { id: 'e8e1e1', label: 'Silver' },
  { id: 'ecdcbf', label: 'Platinum' },
  { id: 'f59797', label: 'Pink' },
];

export const CLOTHING: AvatarOption[] = [
  { id: 'shirtCrewNeck', label: 'Crew tee' },
  { id: 'shirtVNeck', label: 'V-neck' },
  { id: 'shirtScoopNeck', label: 'Scoop neck' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'collarAndSweater', label: 'Sweater' },
  { id: 'blazerAndShirt', label: 'Blazer' },
  { id: 'blazerAndSweater', label: 'Blazer + sweater' },
  { id: 'graphicShirt', label: 'Graphic tee' },
  { id: 'overall', label: 'Overalls' },
];

export const CLOTHES_COLORS: ColorOption[] = [
  { id: 'e11d48', label: 'Rose' }, // brand tint
  { id: '10b981', label: 'Emerald' },
  { id: '65c9ff', label: 'Sky' },
  { id: '5199e4', label: 'Blue' },
  { id: '25557c', label: 'Navy' },
  { id: 'ff488e', label: 'Pink' },
  { id: 'ff5c5c', label: 'Red' },
  { id: 'a7ffc4', label: 'Mint' },
  { id: 'ffffb1', label: 'Yellow' },
  { id: '929598', label: 'Gray' },
  { id: '3c4f5c', label: 'Slate' },
  { id: '262e33', label: 'Charcoal' },
  { id: 'e6e6e6', label: 'Light gray' },
  { id: 'ffffff', label: 'White' },
];

export const EYES: AvatarOption[] = [
  { id: 'default', label: 'Default' },
  { id: 'happy', label: 'Happy' },
  { id: 'wink', label: 'Wink' },
  { id: 'squint', label: 'Squint' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'side', label: 'Side-eye' },
  { id: 'closed', label: 'Closed' },
];

export const BACKGROUNDS: ColorOption[] = [
  { id: 'b6e3f4', label: 'Sky' },
  { id: 'c0aede', label: 'Lavender' },
  { id: 'd1d4f9', label: 'Periwinkle' },
  { id: 'ffd5dc', label: 'Blush' },
  { id: 'ffdfbf', label: 'Peach' },
  { id: 'd1f4d9', label: 'Mint' },
  { id: 'fde68a', label: 'Sun' },
  { id: 'fecdd3', label: 'Rose' },
];

/** UI category metadata so the builder can render tabs generically (Phase 2). */
export const AVATAR_CATEGORIES = [
  { key: 'skinColor', label: 'Skin', kind: 'color', options: SKIN_TONES },
  { key: 'top', label: 'Hair', kind: 'style', options: HAIR_STYLES },
  { key: 'hairColor', label: 'Hair color', kind: 'color', options: HAIR_COLORS },
  { key: 'clothing', label: 'Outfit', kind: 'style', options: CLOTHING },
  { key: 'clothesColor', label: 'Shirt color', kind: 'color', options: CLOTHES_COLORS },
  { key: 'eyes', label: 'Eyes', kind: 'style', options: EYES },
  { key: 'backgroundColor', label: 'Background', kind: 'color', options: BACKGROUNDS },
] as const;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Generate an avatar SVG string.
 * - `seed` makes "auto" avatars deterministic & varied (use the user id).
 * - `config` overrides individual traits once a user customizes (Phase 2).
 * Output is plain SVG suitable for react-native-svg's <SvgXml>.
 */
export function avatarSvg(seed: string, config?: AvatarConfig | null, size = 96): string {
  const single = (v?: string) => (v ? [v] : undefined);
  return createAvatar(avataaars, {
    seed: seed || 'pocketstubs',
    size,
    radius: 50, // circular disc, Duolingo-style
    backgroundColor: single(config?.backgroundColor) ?? [...BACKGROUNDS.map((b) => b.id)],
    skinColor: single(config?.skinColor),
    // top/clothing/eyes are typed as strict literal unions by DiceBear; our
    // catalog ids are guaranteed valid, so cast the validated strings through.
    top: single(config?.top) as any,
    hairColor: single(config?.hairColor),
    clothing: single(config?.clothing) as any,
    clothesColor: single(config?.clothesColor),
    eyes: single(config?.eyes) as any,
  }).toString();
}

/** Stable key for memoizing rendered SVG by its inputs. */
export function avatarCacheKey(seed: string, config?: AvatarConfig | null, size = 96): string {
  return `${seed}|${size}|${config ? JSON.stringify(config) : 'auto'}`;
}

/** A fully-random config for the "Randomize" button (Phase 2 builder). */
export function randomConfig(): AvatarConfig {
  const pick = <T extends { id: string }>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)].id;
  return {
    skinColor: pick(SKIN_TONES),
    top: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    clothing: pick(CLOTHING),
    clothesColor: pick(CLOTHES_COLORS),
    eyes: pick(EYES),
    backgroundColor: pick(BACKGROUNDS),
  };
}
