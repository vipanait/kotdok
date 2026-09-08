/**
 * The design system, transcribed from the concept's stylesheet.
 *
 * One place for the values so a screen never invents a colour or a radius.
 * Names follow the design rather than the code that came before it, so a
 * reviewer can hold the two side by side.
 *
 * Source: docs/design/mobile-concept-v1/style.css
 */

export const colour = {
  /** Page background: the cream the whole app sits on. */
  canvas: '#FBF6EE',
  /** Cards and sheets. */
  surface: '#FFFFFF',
  /** Filled areas inside a card — segment tracks, summary blocks. */
  soft: '#F3EBDD',
  line: '#E8DECB',

  text: '#1F1B15',
  muted: '#5B5346',
  faint: '#767062',

  /** Actions. Deliberately not the logo's orange: see below. */
  accent: '#0B6B5E',
  accentText: '#0A5F54',
  accentSoft: '#DDEFEB',

  danger: '#A32B1C',
  dangerSoft: '#FBE1DC',

  disabled: '#EDE7DE',
  disabledText: '#6E675B',
} as const

/**
 * Urgency has its own scale, and it owns the whole red-to-amber range.
 *
 * The site makes orange both the brand and the alarm, so "Save" shouts as
 * loudly as "СРОЧНО". Here the accent moved to teal and these five are the only
 * place warm colours appear — which is what lets a red badge mean something.
 */
export const urgency = {
  emergency: { signal: '#A32B1C', background: '#FBE1DC' },
  urgent: { signal: '#A8501B', background: '#FCE9D8' },
  monitor: { signal: '#7A6000', background: '#FAF0D2' },
  home_care: { signal: '#0A5F54', background: '#DDEFEB' },
  healthy: { signal: '#1F6E45', background: '#DCEEE2' },
} as const

export const font = {
  /** Headings. Softer than the body face, which is the point. */
  display: 'Nunito',
  body: 'Manrope',
} as const

export const type = {
  h1: { fontFamily: font.display, fontSize: 30, lineHeight: 36, fontWeight: '700' },
  h2: { fontFamily: font.display, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  h3: { fontFamily: font.body, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontFamily: font.body, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  action: { fontFamily: font.body, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  label: { fontFamily: font.body, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontFamily: font.body, fontSize: 12, lineHeight: 16, fontWeight: '400' },
  segment: { fontFamily: font.body, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tab: { fontFamily: font.body, fontSize: 11, lineHeight: 14, fontWeight: '500' },
  urgencyTitle: { fontFamily: font.display, fontSize: 28, lineHeight: 32, fontWeight: '800' },
  balance: { fontFamily: font.display, fontSize: 48, lineHeight: 56, fontWeight: '700' },
} as const

export const radius = {
  field: 14,
  card: 20,
  pill: 999,
} as const

export const space = {
  /** Screen gutter. Every screen uses this and not a number of its own. */
  gutter: 20,
  row: 12,
  block: 20,
  section: 32,
} as const

/**
 * The minimum a finger can be asked to hit. Chips are 44 in the concept rather
 * than 40 so the visible shape and the tap target are the same thing — a chip
 * that is smaller than its hit area teaches people to distrust their aim.
 */
export const TAP_TARGET = 44
export const CONTROL_HEIGHT = 52

export const shadow = {
  card: {
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
} as const
