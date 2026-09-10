import { describe, expect, it } from 'vitest'
import { hiddenBelowKeyboard } from './keyboard-reveal'

/**
 * Stage 7/03: the field being typed into has to stay visible.
 *
 * The numbers here are the ones measured on an iPhone 13 on 10 September 2026,
 * with the notes field of the pet form focused. iOS had already scrolled by
 * then — it brings the caret into view and stops, which for a hundred-and-eight
 * point box means one visible line. The dock rides up with the keyboard and
 * covers another seventy-six points below that.
 */

/** The keyboard's top edge, and the dock's height, as measured on the device. */
const KEYBOARD_TOP = 509
const DOCK = 76

describe('how far a focused field has to travel', () => {
  it('lifts a notes box that iOS left under the keyboard', () => {
    // y=489..597 against a limit of 509-76-12=421.
    expect(hiddenBelowKeyboard({ top: 489, height: 108 }, KEYBOARD_TOP, DOCK)).toBe(176)
  })

  it('leaves a field that is already clear where it is', () => {
    // The name field, at y=271..292, needs nothing — and scrolling it anyway
    // would move the form under the reader's thumb for no reason.
    expect(hiddenBelowKeyboard({ top: 271, height: 21 }, KEYBOARD_TOP, DOCK)).toBe(0)
  })

  it('counts the dock, not just the keyboard', () => {
    // A field that clears the keyboard is still covered when the dock is
    // between the two — which is the bug 7/03 was reopened for.
    expect(hiddenBelowKeyboard({ top: 397, height: 100 }, KEYBOARD_TOP, 0)).toBe(0)
    expect(hiddenBelowKeyboard({ top: 397, height: 100 }, KEYBOARD_TOP, DOCK)).toBe(DOCK)
  })

  it('keeps a gap, so the field does not touch what is below it', () => {
    // Exactly on the limit means flush against the dock, which reads as cut off.
    expect(hiddenBelowKeyboard({ top: 400, height: 109 }, KEYBOARD_TOP, 0)).toBe(12)
  })

  it('works on a screen with no dock at all', () => {
    expect(hiddenBelowKeyboard({ top: 500, height: 40 }, KEYBOARD_TOP, 0)).toBe(43)
  })
})
