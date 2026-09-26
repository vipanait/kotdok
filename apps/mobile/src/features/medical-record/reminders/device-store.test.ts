import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDERS } from './schedule'
import { askAgainAfter, createReminderStore, readSettings, shouldAsk } from './device-store'

function memory() {
  const values = new Map<string, string>()
  return {
    values,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void values.set(key, value),
    deleteItemAsync: async (key: string) => void values.delete(key),
  }
}

describe('reminder settings on this phone', () => {
  it('starts at «за 3 дня», 10:00, on', () => {
    expect(readSettings(null)).toEqual(DEFAULT_REMINDERS)
  })

  it('keeps what is valid and replaces what is not', () => {
    expect(readSettings('{"enabled":false,"daysBefore":7,"hour":21}')).toEqual({ enabled: false, daysBefore: 7, hour: 21 })
    expect(readSettings('{"enabled":false,"daysBefore":5,"hour":23}')).toEqual({ ...DEFAULT_REMINDERS, enabled: false })
    expect(readSettings('not json')).toEqual(DEFAULT_REMINDERS)
  })

  it('writes and reads back', async () => {
    const store = createReminderStore(memory())
    await store.saveSettings({ enabled: true, daysBefore: 1, hour: 8 })
    expect(await store.settings()).toEqual({ enabled: true, daysBefore: 1, hour: 8 })
  })
})

describe('asking for permission (spec §7.19)', () => {
  const now = new Date(2026, 8, 24, 12, 0)

  it('asks until «Не сейчас», then not for 30 days', async () => {
    const store = createReminderStore(memory())
    expect(shouldAsk(await store.notNowUntil(), now)).toBe(true)
    await store.notNow(now)
    const until = await store.notNowUntil()
    expect(until).toEqual(askAgainAfter(now))
    expect(shouldAsk(until, new Date(2026, 9, 23, 12, 0))).toBe(false)
    expect(shouldAsk(until, new Date(2026, 9, 24, 12, 1))).toBe(true)
  })
})
