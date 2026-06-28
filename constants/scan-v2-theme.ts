/**
 * Ticket Scan v2 — dark-only theme tokens.
 *
 * Verbatim from the design prototype's `SCAN_TOKENS.dark` + rose accent
 * (`scan-art.jsx`). v2 is dark-only: surfaces are built from these hardcoded
 * tokens, NOT routed through the theme-aware `Colors`/`IconButton`/
 * `bottom-sheet-modal` (which render light-on-dark in light mode). Keeping these
 * separate from `constants/theme.ts` guarantees the flag-off v1 flow is
 * byte-identical.
 */

export const ScanV2Colors = {
  bg: '#09090b',
  bgAlt: '#0a0a0d',
  surface: '#141418',
  card: '#1b1b20',
  cardHi: '#26262d',
  line: 'rgba(255,255,255,0.08)',
  lineHi: 'rgba(255,255,255,0.16)',
  text: '#fafafa',
  sec: '#a1a1aa',
  ter: '#71717a',
  field: 'rgba(255,255,255,0.05)',
  fieldLine: 'rgba(255,255,255,0.09)',
  emerald: '#10b981',
  amber: '#fbbf24',
} as const;

export const ScanV2Accent = {
  primary: '#e11d48',
  deep: '#be123c',
  soft: 'rgba(225,29,72,0.14)',
  glow: 'rgba(225,29,72,0.40)',
  on: '#ffffff',
} as const;

export type ScanV2ColorTokens = typeof ScanV2Colors;
export type ScanV2AccentTokens = typeof ScanV2Accent;
