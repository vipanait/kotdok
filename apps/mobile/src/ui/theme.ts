/**
 * The design system as the screens read it.
 *
 * The colours and the faces are the shared design tokens (@lapka/shared
 * `tokens.ts`, from docs/design/mobile-design-spec.md §4): the site renders
 * its stylesheet from the same values, so a colour corrected there changes
 * here too. Only what is a measurement in points stays in this file.
 */

import { due, font, palette, urgency } from '@lapka/shared'

export { due, font, urgency }

/** The palette under the name every screen imports it by. */
export const colour = palette

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
  tagline: { fontFamily: font.body, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  provider: { fontFamily: font.body, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  urgencyTitle: { fontFamily: font.display, fontSize: 28, lineHeight: 32, fontWeight: '800' },
  balance: { fontFamily: font.display, fontSize: 48, lineHeight: 56, fontWeight: '700' },
} as const

/**
 * Sign-in providers own their marks and the buttons around them.
 *
 * These are not Lapka's palette and must not be nudged towards it — a
 * recoloured Google button is a breach of their guidelines, not a refinement.
 * Sources and rules: `assets/provider-sources.md` in the design concept.
 */
export const provider = {
  google: { background: '#FFFFFF', border: '#747775', text: '#1F1F1F' },
  yandex: { background: '#FFFFFF', border: '#B3B3B3', text: '#000000' },
  apple: { background: '#FFFFFF', border: '#747775', text: '#000000' },
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

/**
 * How wide the content column is allowed to get.
 *
 * The concept is drawn at 390 points and every measurement in it — the 20 pt
 * gutter, the 52 pt controls, the line length — assumes a phone held in one
 * hand. Left unbounded on a tablet the same layout puts a name field across a
 * forearm of glass. The column stops here and centres instead; so do the
 * sheets that rise over it.
 */
export const COLUMN_MAX_WIDTH = 480

export const shadow = {
  card: {
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
} as const
