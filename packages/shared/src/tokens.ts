/**
 * The design tokens, once: docs/design/mobile-design-spec.md §4 written as
 * values. The phone's theme is built from them and the site's custom
 * properties (`apps/web/src/app/styles/tokens.css`) are rendered from them by
 * `tokensCss`, so a colour corrected here reaches both — the site's hairline
 * and muted text had wandered from the spec on their own.
 *
 * Names follow the spec rather than either app's code, so a reviewer can hold
 * the table and this file side by side.
 */

export const palette = {
  /** Page background: the cream the whole app sits on. */
  canvas: '#FBF6EE',
  /** Cards, fields and sheets. */
  surface: '#FFFFFF',
  /** Filled areas inside a card — segment tracks, empty states, summary blocks. */
  soft: '#F3EBDD',
  /** Borders of fields and cards, dividers. */
  line: '#E8DECB',

  text: '#1F1B15',
  muted: '#5B5346',
  faint: '#767062',

  /** Actions. Deliberately not the logo's orange: the warm range belongs to urgency. */
  accent: '#0B6B5E',
  accentPressed: '#095349',
  /** Links and accented text: darker than the fill so it reads on the canvas. */
  accentText: '#0A5F54',
  accentSoft: '#DDEFEB',

  /** The logo's orange. The mark only — never a button (spec §12). */
  brand: '#EB8124',

  danger: '#A32B1C',
  dangerSoft: '#FBE1DC',

  disabled: '#EDE7DE',
  disabledText: '#6E675B',
} as const

/**
 * Urgency has its own scale, and it owns the whole red-to-amber range: these
 * five are the only place warm colours appear, which is what lets a red badge
 * mean something.
 */
export const urgency = {
  emergency: { signal: '#A32B1C', background: '#FBE1DC' },
  urgent: { signal: '#A8501B', background: '#FCE9D8' },
  monitor: { signal: '#7A6000', background: '#FAF0D2' },
  home_care: { signal: '#0A5F54', background: '#DDEFEB' },
  healthy: { signal: '#1F6E45', background: '#DCEEE2' },
} as const

/**
 * The «Напоминания» card (due priority design, 20 October 2026). A missed date
 * is a calm terracotta line and word — not the urgency scale, which stays the
 * only alarm: it says a day passed, not that the pet is in danger.
 */
export const due = {
  overdue: '#A44836',
  iconBox: '#F4F0E8',
  date: '#716B61',
} as const

export const font = {
  /** Headings. Softer than the body face, which is the point. */
  display: 'Nunito',
  body: 'Manrope',
} as const

/** The site's names for the palette, as its stylesheets have always used them. */
const CSS_NAMES: Record<string, keyof typeof palette> = {
  bg: 'canvas',
  paper: 'surface',
  soft: 'soft',
  line: 'line',
  text: 'text',
  muted: 'muted',
  faint: 'faint',
  green: 'accent',
  'green-hover': 'accentPressed',
  'green-text': 'accentText',
  mint: 'accentSoft',
  orange: 'brand',
  red: 'danger',
  'red-tint': 'dangerSoft',
  disabled: 'disabled',
  'disabled-text': 'disabledText',
}

/**
 * The site's `tokens.css`: the palette as custom properties on `:root`, and
 * a class per urgency level setting the `--signal` / `--tint` pair the badges
 * and result pages read. A test keeps the committed file equal to this.
 */
export function tokensCss(): string {
  const lines = [
    '/* Generated from packages/shared/src/tokens.ts by `npm run tokens:update --workspace @lapka/web`. */',
    '/* Do not edit by hand: the test that writes it fails when the two disagree. */',
    '',
    ':root {',
    ...Object.entries(CSS_NAMES).map(([name, key]) => `  --${name}: ${palette[key]};`),
    '',
    `  --due-overdue: ${due.overdue};`,
    `  --due-icon-box: ${due.iconBox};`,
    `  --due-date: ${due.date};`,
    '}',
    '',
    ...Object.entries(urgency).map(
      ([level, { signal, background }]) => `.${level} { --signal: ${signal}; --tint: ${background}; }`,
    ),
  ]
  return lines.join('\n') + '\n'
}
