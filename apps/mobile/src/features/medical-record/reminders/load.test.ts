import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '@lapka/shared'
import { loadReminderAccount, type Call, type Read } from './load'

const pets = [{ id: 'pet-1', name: 'Мурка' }, { id: 'pet-2', name: 'Рекс' }]
const timed = { id: 'm-1', reminder_times: ['08:00'], started_on: '2026-10-01', ended_on: null }
const untimed = { id: 'm-2', reminder_times: [], started_on: null, ended_on: null }

/** A cache that answers from what it holds, or asks and records the key. */
function fakeCache(held: Record<string, unknown> = {}) {
  const asked: string[] = []
  const read = vi.fn(async <T,>(key: readonly unknown[], load: () => Promise<T>): Promise<T> => {
    const name = key.join('/')
    asked.push(name)
    if (name in held) return held[name] as T
    return load()
  })
  return { read: read as unknown as Read, calls: read, asked }
}

const api = {
  listDue: vi.fn(async () => [{ id: 'due-1' }]),
  listPets: vi.fn(async () => pets),
  listFollowups: vi.fn(async () => ({ items: [{ id: 'case-1' }] })),
  getHealthOverview: vi.fn(async (petId: string) => ({ medications: petId === 'pet-1' ? [timed, untimed] : [untimed] })),
  listDoses: vi.fn(async () => [{ medication_id: 'm-1', taken_on: '2026-10-25', slot: '08:00' }]),
}
const call: Call = (fn) => fn(api as unknown as ApiClient)

describe('loadReminderAccount', () => {
  it('reads every list and record through the cache, under the screens’ own keys', async () => {
    const cache = fakeCache()
    const data = await loadReminderAccount({ read: cache.read, call, today: '2026-10-25' })

    expect(cache.asked).toEqual(expect.arrayContaining(['due', 'pets', 'followups', 'overview/pet-1', 'overview/pet-2']))
    expect(data.pets).toEqual(pets)
    expect(data.due).toEqual([{ id: 'due-1' }])
    expect(data.followups).toEqual([{ id: 'case-1' }])
  })

  it('asks for the week’s doses only for pets with a course given at set times', async () => {
    const cache = fakeCache()
    const data = await loadReminderAccount({ read: cache.read, call, today: '2026-10-25' })

    expect(cache.asked).toContain('doses/pet-1/2026-10-25/2026-11-01')
    expect(cache.asked.some((key) => key.startsWith('doses/pet-2'))).toBe(false)
    expect(data.courses).toEqual([{ pet: pets[0], course: timed }])
    expect(data.doses).toHaveLength(1)
  })

  it('takes a record the cache already holds without asking the server', async () => {
    const cache = fakeCache({ 'overview/pet-2': { medications: [] } })
    api.getHealthOverview.mockClear()
    await loadReminderAccount({ read: cache.read, call, today: '2026-10-25' })

    expect(api.getHealthOverview).toHaveBeenCalledTimes(1)
    expect(api.getHealthOverview).toHaveBeenCalledWith('pet-1', '2026-10-25')
  })

  it('leaves out a pet deleted meanwhile, and stops on any other failure', async () => {
    const gone = vi.fn(async (petId: string) => {
      if (petId === 'pet-2') throw new ApiError('not_found', 404, 'gone')
      return { medications: [] }
    })
    const cache = fakeCache()
    const data = await loadReminderAccount({ read: cache.read, call: (fn) => fn({ ...api, getHealthOverview: gone } as unknown as ApiClient), today: '2026-10-25' })
    expect(data.courses).toEqual([])

    const broken = vi.fn(async () => {
      throw new Error('network')
    })
    await expect(loadReminderAccount({ read: cache.read, call: (fn) => fn({ ...api, getHealthOverview: broken } as unknown as ApiClient), today: '2026-10-25' })).rejects.toThrow('network')
  })

  it('does without the follow-up cases when they cannot be read', async () => {
    const cache = fakeCache()
    const data = await loadReminderAccount({
      read: cache.read,
      call: (fn) => fn({ ...api, listFollowups: async () => { throw new Error('older server') } } as unknown as ApiClient),
      today: '2026-10-25',
    })
    expect(data.followups).toEqual([])
    expect(data.pets).toEqual(pets)
  })
})
