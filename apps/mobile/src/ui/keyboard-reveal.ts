/** Breathing room between the field being typed into and whatever is below it. */
export const REVEAL_GAP = 12

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
