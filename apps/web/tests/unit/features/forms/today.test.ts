import { describe, expect, it } from 'vitest'
import { DAY_CHECK_MAX_MS, dayAfterLook, msUntilNextDay, nextDayCheckDelay } from '@/features/forms/today'

describe('the owner’s day moving on at midnight (MW-09)', () => {
  it('waits until just past the next local midnight, and never more than a minute between looks', () => {
    const late = new Date(2026, 8, 27, 23, 59, 30)
    expect(msUntilNextDay(late)).toBe(30_250)
    expect(nextDayCheckDelay(late)).toBe(30_250)
    expect(nextDayCheckDelay(new Date(2026, 8, 27, 12, 0, 0))).toBe(DAY_CHECK_MAX_MS)
  })

  it('moves the page to the browser’s new day once the browser’s day changes', () => {
    expect(dayAfterLook('2026-09-27', '2026-09-27', new Date(2026, 8, 28, 0, 0, 1))).toEqual({ shown: '2026-09-28', seen: '2026-09-28' })
  })

  it('keeps the page’s day while the browser’s day is the one it last saw', () => {
    // The page was drawn with the owner's zone; the browser's own day is another one, and has not changed.
    expect(dayAfterLook('2026-09-28', '2026-09-27', new Date(2026, 8, 27, 22, 0))).toEqual({ shown: '2026-09-28', seen: '2026-09-27' })
  })
})
