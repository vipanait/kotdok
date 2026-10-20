import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@lapka/shared'
import { createDoseActions, type DoseApi } from '@/features/medical-record/doses/dose-actions'

const PET = 'p1'
const DAY = '2026-10-20'
const given = (slot: string, medication_id = 'c1') => ({ medication_id, taken_on: DAY, slot })

function api(overrides: Partial<DoseApi> = {}): DoseApi {
  return {
    markDose: vi.fn(async (_pet, medicationId, body) => ({ medication_id: medicationId, taken_on: body.taken_on, slot: body.slot })),
    unmarkDose: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('«Дали» and «Отменить» on one dose', () => {
  it('«Дали» marks exactly that course, day and time, and shows it once the server said so', async () => {
    const server = api()
    const actions = createDoseActions(server, PET)
    const result = await actions.mark([], 'c1', DAY, '08:00')
    expect(server.markDose).toHaveBeenCalledWith(PET, 'c1', { taken_on: DAY, slot: '08:00' })
    expect(result).toEqual({ ok: true, doses: [given('08:00')] })
  })

  it('«Отменить» takes off only that dose — the course and the other doses stay', async () => {
    const server = api()
    const actions = createDoseActions(server, PET)
    const result = await actions.unmark([given('08:00'), given('20:00'), given('08:00', 'c2')], 'c1', DAY, '08:00')
    expect(server.unmarkDose).toHaveBeenCalledWith(PET, 'c1', { taken_on: DAY, slot: '08:00' })
    expect(result).toEqual({ ok: true, doses: [given('20:00'), given('08:00', 'c2')] })
  })

  it('a second press while the first runs sends nothing', async () => {
    let finish: () => void = () => {}
    const server = api({
      markDose: vi.fn(
        (_pet: string, medicationId: string, body: { taken_on: string; slot: string }) =>
          new Promise<{ medication_id: string; taken_on: string; slot: string }>((resolve) => {
            finish = () => resolve({ medication_id: medicationId, taken_on: body.taken_on, slot: body.slot })
          }),
      ),
    })
    const actions = createDoseActions(server, PET)
    const first = actions.mark([], 'c1', DAY, '08:00')
    expect(actions.isPending('c1', DAY, '08:00')).toBe(true)
    expect(await actions.mark([], 'c1', DAY, '08:00')).toEqual({ ok: false, reason: 'busy' })
    expect(await actions.unmark([], 'c1', DAY, '08:00')).toEqual({ ok: false, reason: 'busy' })
    finish()
    await first
    expect(server.markDose).toHaveBeenCalledTimes(1)
    expect(actions.isPending('c1', DAY, '08:00')).toBe(false)
  })

  it('another time of the same course is not blocked by it', async () => {
    const server = api({ markDose: vi.fn(() => new Promise<never>(() => {})) })
    const actions = createDoseActions(server, PET)
    void actions.mark([], 'c1', DAY, '08:00')
    expect(actions.isPending('c1', DAY, '20:00')).toBe(false)
  })

  it('no false success: a failed «Дали» leaves the dose unmarked, and says why', async () => {
    const actions = createDoseActions(api({ markDose: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) }), PET)
    expect(await actions.mark([given('20:00')], 'c1', DAY, '08:00')).toEqual({ ok: false, reason: 'offline' })
    expect(actions.isPending('c1', DAY, '08:00')).toBe(false)
  })

  it('a failed «Отменить» keeps the dose marked', async () => {
    const actions = createDoseActions(api({ unmarkDose: vi.fn(async () => Promise.reject(new ApiError('internal_error', 500, 'x'))) }), PET)
    expect(await actions.unmark([given('08:00')], 'c1', DAY, '08:00')).toEqual({ ok: false, reason: 'failed' })
  })

  it('a dose already taken off elsewhere (404) is simply not marked any more', async () => {
    const actions = createDoseActions(api({ unmarkDose: vi.fn(async () => Promise.reject(new ApiError('not_found', 404, 'x'))) }), PET)
    expect(await actions.unmark([given('08:00')], 'c1', DAY, '08:00')).toEqual({ ok: true, doses: [] })
  })

  it('marking a dose the phone marked meanwhile shows it once', async () => {
    const actions = createDoseActions(api(), PET)
    expect(await actions.mark([given('08:00')], 'c1', DAY, '08:00')).toEqual({ ok: true, doses: [given('08:00')] })
  })
})
