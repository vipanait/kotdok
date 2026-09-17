import { describe, expect, it, vi } from 'vitest'
import { guardTabSwitch, setTabGuard } from './tab-guard'

describe('tab guard', () => {
  it('lets the switch through when no screen has changes', () => {
    const proceed = vi.fn()

    expect(guardTabSwitch(proceed)).toBe(false)
    expect(proceed).not.toHaveBeenCalled()
  })

  it('hands the switch to the guarding screen until it lets go', () => {
    const guard = vi.fn()
    const release = setTabGuard(guard)
    const proceed = () => {}

    expect(guardTabSwitch(proceed)).toBe(true)
    expect(guard).toHaveBeenCalledWith(proceed)

    release()
    expect(guardTabSwitch(proceed)).toBe(false)
  })

  it('keeps a newer guard when an older one lets go late', () => {
    const releaseOld = setTabGuard(() => {})
    const newer = vi.fn()
    const releaseNewer = setTabGuard(newer)

    releaseOld()
    expect(guardTabSwitch(() => {})).toBe(true)
    expect(newer).toHaveBeenCalled()
    releaseNewer()
  })
})
