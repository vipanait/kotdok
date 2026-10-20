import type { MedicationDose, MedicationDoseInput } from '@lapka/contracts'
import { ApiError, ApiTimeoutError, doseKey } from '@lapka/shared'

/**
 * «Дали» and «Отменить» on one dose of «Сегодня» (FB-5), through the server:
 * the card shows a dose as given only once the server has it, and takes it
 * off only once the server did. One request per dose at a time — a second
 * press while it runs sends nothing — and the server's mark is idempotent,
 * so a dose given on the phone meanwhile is shown once.
 */

export type DoseApi = {
  markDose: (petId: string, medicationId: string, body: MedicationDoseInput) => Promise<MedicationDose>
  unmarkDose: (petId: string, medicationId: string, body: MedicationDoseInput) => Promise<void>
}

export type DoseFailure = 'busy' | 'offline' | 'signedOut' | 'deleting' | 'failed'

export type DoseResult = { ok: true; doses: MedicationDose[] } | { ok: false; reason: DoseFailure }

function failure(error: unknown): DoseFailure {
  if (error instanceof ApiError) {
    if (error.code === 'unauthorized') return 'signedOut'
    if (error.code === 'account_deleting') return 'deleting'
    return 'failed'
  }
  if (error instanceof TypeError || error instanceof ApiTimeoutError) return 'offline'
  return 'failed'
}

export function createDoseActions(api: DoseApi, petId: string) {
  const pending = new Set<string>()

  async function run(
    medicationId: string,
    day: string,
    slot: string,
    send: () => Promise<MedicationDose[]>,
    gone?: () => MedicationDose[],
  ): Promise<DoseResult> {
    const key = doseKey(medicationId, day, slot)
    if (pending.has(key)) return { ok: false, reason: 'busy' }
    pending.add(key)
    try {
      return { ok: true, doses: await send() }
    } catch (error) {
      if (gone && error instanceof ApiError && error.code === 'not_found') return { ok: true, doses: gone() }
      return { ok: false, reason: failure(error) }
    } finally {
      pending.delete(key)
    }
  }

  const without = (doses: readonly MedicationDose[], medicationId: string, day: string, slot: string) =>
    doses.filter((dose) => doseKey(dose.medication_id, dose.taken_on, dose.slot) !== doseKey(medicationId, day, slot))

  return {
    isPending: (medicationId: string, day: string, slot: string) => pending.has(doseKey(medicationId, day, slot)),

    mark: (doses: readonly MedicationDose[], medicationId: string, day: string, slot: string) =>
      run(medicationId, day, slot, async () => {
        const marked = await api.markDose(petId, medicationId, { taken_on: day, slot })
        return [...without(doses, medicationId, day, slot), { medication_id: marked.medication_id, taken_on: marked.taken_on, slot: marked.slot }]
      }),

    unmark: (doses: readonly MedicationDose[], medicationId: string, day: string, slot: string) =>
      run(
        medicationId,
        day,
        slot,
        async () => {
          await api.unmarkDose(petId, medicationId, { taken_on: day, slot })
          return without(doses, medicationId, day, slot)
        },
        // Taken off elsewhere already: the same end.
        () => without(doses, medicationId, day, slot),
      ),
  }
}

export type DoseActions = ReturnType<typeof createDoseActions>
