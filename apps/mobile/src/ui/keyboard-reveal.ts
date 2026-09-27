/** Breathing room between the field being typed into and whatever is below it. */
export const REVEAL_GAP = 12

/**
 * How far a field has to travel down into view when it is above the top of
 * the scroller — scrolled past, and focused from below (the first field with
 * an error after «Сохранить» in the dock), so far that its name above it
 * shows too. Zero when that is visible. Window coordinates, like
 * `hiddenBelowKeyboard`.
 */
export function hiddenAboveTop(fieldTop: number, scrollerTop: number): number {
  return Math.max(0, scrollerTop + LABEL_ROOM - fieldTop)
}

/** Room above a field brought down into view: its name (one line of label) and a gap. */
export const LABEL_ROOM = 40

/**
 * How far a field has to travel to sit above the keyboard and the dock.
 *
 * Zero when it already does: scrolling a field that is fully visible moves the
 * form under the reader's thumb for no reason.
 *
 * Everything is in window coordinates, the frame `measureInWindow` and
 * `Keyboard.metrics()` both answer in.
 */
export function hiddenBelowKeyboard(
  field: { top: number; height: number },
  keyboardTop: number,
  dockHeight: number,
): number {
  const limit = keyboardTop - dockHeight - REVEAL_GAP
  return Math.max(0, field.top + field.height - limit)
}
