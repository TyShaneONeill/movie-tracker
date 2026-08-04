# PocketStubs design system — build conventions

These are react-native-web components compiled from the PocketStubs app. They are **dark-first**: the app's default surface is near-black zinc.

## Wrap everything in PocketStubsProvider

```jsx
const { PocketStubsProvider, ThemedText, Colors } = window.PocketStubs;
<PocketStubsProvider theme="dark">
  <div style={{ backgroundColor: Colors.dark.background, minHeight: '100%', padding: 16 }}>
    {/* your screen */}
  </div>
</PocketStubsProvider>
```

Without it, any component reading the theme throws ("useTheme must be used within a ThemeProvider") and social components (ReviewCard, LikeButton, FeedItemCard) throw on the missing query client. `theme` accepts `"dark"` or `"light"`. **Always give your page an explicit `Colors.dark.background` canvas** — many components draw near-white text with no surface of their own; on a white page they are invisible.

## Styling idiom: JS token constants, not CSS classes

There is **no utility-class vocabulary**. Style layout glue with inline styles using the exported token objects:

- `Colors.dark` / `Colors.light` — `background` #09090b, `backgroundSecondary`, `card` #27272a, `glass`, `text` #fafafa, `textSecondary`, `textTertiary`, `tint` #e11d48 (rose accent), `accentSecondary` #10b981 (success), `gold` #fbbf24 (premium), `blue` (watching), `error`, `border`
- `Spacing` (`xs`…), `BorderRadius`, `FontSizes` — numeric px values
- `Typography` — ready TextStyle presets (`Typography.display.h1`, etc.) for ThemedText's `style`
- `Fonts` — font families; **each weight is its own family** (`Fonts.outfit.extrabold` → `'Outfit_800ExtraBold'`). Outfit = headings/display, Inter = body, `Fonts.mono` (JetBrains Mono) = ticket/metadata microcopy. Never use numeric `fontWeight` — pick the weight's family.

The same tokens exist as CSS vars (`--ps-color-*`, `--ps-space-*`, `--ps-radius-*`, `--ps-text-*`) in `_ds_bundle.css` (pulled in by `styles.css`) if you're styling plain HTML.

## Layout glue gotcha

These are RN-web components: `Text` renders inline and a plain `div` is not a column. Any div stacking component children needs `display:'flex', flexDirection:'column'`.

## Where the truth lives

Read `styles.css` and its imports (tokens + @font-face) and each component's `.prompt.md` / `.d.ts` under `components/general/<Name>/` before styling. Components are prop-driven — realistic props produce the designed look (e.g. `ReviewCard` needs a review object; a rating-only take renders **no review text by design** — never fake text around it).

## Idiomatic example (verified render)

```jsx
const { PocketStubsProvider, Colors, Typography, ThemedText, SectionHeader, StarRating, Tag } = window.PocketStubs;
<PocketStubsProvider theme="dark">
  <div style={{ backgroundColor: Colors.dark.background, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <SectionHeader title="Trending This Week" />
    <ThemedText style={Typography.display.h1}>Dune: Part Two</ThemedText>
    <StarRating rating={4} size={28} />
    <div style={{ display: 'flex', gap: 8 }}>
      <Tag label="Sci-Fi" /><Tag label="IMAX" active />
    </div>
  </div>
</PocketStubsProvider>
```
