import { describe, expect, it } from 'vitest'
import type { DueItem } from '@lapka/contracts'
import { ru } from '@/i18n/ru'
import { DEFAULT_REMINDERS } from './schedule'
import { createReminderSync, openTarget, type Notifier } from './sync'

const A_PET = '11111111-1111-4111-8111-000000000001'
const B_PET = '22222222-2222-4222-8222-000000000001'
const NOW = new Date(2026, 8, 24, 12, 0)

function item(petId: string): DueItem {
  return { pet_id: petId, event_id: petId, item_id: petId, kind: 'vaccination', date: '2026-10-10', name: null, targets: ['rabies'] }
}

function fakeNotifier(granted = true) {
  const scheduled = new Map<string, { body: string; data: Record<string, string> }>()
  const notifier: Notifier = {
    granted: async () => granted,
    cancelAll: async () => scheduled.clear(),
    schedule: async (reminder, data) => void scheduled.set(reminder.id, { body: reminder.body, data }),
  }
  return { notifier, scheduled }
}

function account(userId: string, petId: string, name: string) {
  return { userId, load: async () => ({ due: [item(petId)], pets: [{ id: petId, name }] }) }
}

describe('keeping the phone’s notifications in step', () => {
  it('schedules the signed-in owner’s plans with who they belong to', async () => {
    const { notifier, scheduled } = fakeNotifier()
    const sync = createReminderSync({ notifier, settings: async () => DEFAULT_REMINDERS, t: () => ru, now: () => NOW })
    await sync.run(account('user-a', A_PET, 'Мурка'))
    expect([...scheduled.values()].map((n) => n.data)).toEqual([
      { petId: A_PET, userId: 'user-a' },
      { petId: A_PET, userId: 'user-a' },
      { petId: A_PET, userId: 'user-a' },
    ])
  })

  it('leaves nothing of the previous account after sign-out and another sign-in (MR-08.3)', async () => {
    const { notifier, scheduled } = fakeNotifier()
    const sync = createReminderSync({ notifier, settings: async () => DEFAULT_REMINDERS, t: () => ru, now: () => NOW })
    await sync.run(account('user-a', A_PET, 'Мурка'))
    await sync.clear()
    expect(scheduled.size).toBe(0)
    await sync.run(account('user-b', B_PET, 'Бобик'))
    expect([...scheduled.values()].every((n) => n.data.userId === 'user-b' && n.data.petId === B_PET)).toBe(true)
  })

  it('does not schedule a sync that was still loading when the account signed out', async () => {
    const { notifier, scheduled } = fakeNotifier()
    const sync = createReminderSync({ notifier, settings: async () => DEFAULT_REMINDERS, t: () => ru, now: () => NOW })
    let release: () => void = () => {}
    const slow = {
      userId: 'user-a',
      load: () => new Promise<{ due: DueItem[]; pets: { id: string; name: string }[] }>((resolve) => {
        release = () => resolve({ due: [item(A_PET)], pets: [{ id: A_PET, name: 'Мурка' }] })
      }),
    }
    const running = sync.run(slow)
    // Let the run get as far as loading.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await sync.clear()
    release()
    await running
    expect(scheduled.size).toBe(0)
  })

  it('replaces the plan on each run: a moved or removed plan leaves no old notification', async () => {
    const { notifier, scheduled } = fakeNotifier()
    const sync = createReminderSync({ notifier, settings: async () => DEFAULT_REMINDERS, t: () => ru, now: () => NOW })
    await sync.run(account('user-a', A_PET, 'Мурка'))
    await sync.run({ userId: 'user-a', load: async () => ({ due: [], pets: [{ id: A_PET, name: 'Мурка' }] }) })
    expect(scheduled.size).toBe(0)
  })

  it('schedules nothing without permission, or when turned off', async () => {
    const denied = fakeNotifier(false)
    await createReminderSync({ notifier: denied.notifier, settings: async () => DEFAULT_REMINDERS, t: () => ru, now: () => NOW }).run(
      account('user-a', A_PET, 'Мурка'),
    )
    expect(denied.scheduled.size).toBe(0)
    const off = fakeNotifier()
    await createReminderSync({ notifier: off.notifier, settings: async () => ({ ...DEFAULT_REMINDERS, enabled: false }), t: () => ru, now: () => NOW }).run(
      account('user-a', A_PET, 'Мурка'),
    )
    expect(off.scheduled.size).toBe(0)
  })
})

describe('where a tapped notification leads (MR-08.5)', () => {
  const pets = [{ id: A_PET }]

  it('opens the pet’s medical record for its owner', () => {
    expect(openTarget({ petId: A_PET, userId: 'user-a' }, 'user-a', pets)).toBe(`/pets/${A_PET}`)
  })

  it('goes to the pet list for a deleted pet, another account, or a notification it does not know', () => {
    expect(openTarget({ petId: A_PET, userId: 'user-a' }, 'user-a', [])).toBe('/pets')
    expect(openTarget({ petId: A_PET, userId: 'user-a' }, 'user-b', pets)).toBe('/pets')
    expect(openTarget({ something: 'else' }, 'user-a', pets)).toBe('/pets')
    expect(openTarget({ petId: '../../profile', userId: 'user-a' }, 'user-a', [{ id: '../../profile' }])).toBe('/pets')
  })
})
