/**
 * Runs `fn` once, `waitMs` after the last of a burst of calls. A save that
 * invalidates five keys and asks for the reminders to be rebuilt should
 * rebuild them once, not five times.
 */
export function trailing(fn: () => void, waitMs: number): (() => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn()
    }, waitMs)
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return debounced
}
