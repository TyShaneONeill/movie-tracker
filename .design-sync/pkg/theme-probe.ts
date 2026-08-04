// Node-side probe: re-exports theme constants + the flat font-family list
// so build.mjs can generate styles.css from the real values.
import { Colors, Spacing, BorderRadius, FontSizes, Fonts } from '../../constants/theme';

const flat = new Set<string>();
for (const group of [Fonts.inter, Fonts.outfit, Fonts.mono]) {
  for (const v of Object.values(group)) if (typeof v === 'string') flat.add(v);
}

export { Colors, Spacing, BorderRadius, FontSizes };
export const FontsFlat = [...flat];
