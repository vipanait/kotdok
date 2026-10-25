import type { DueItem, FollowupCaseSummary, MedicationDose } from '@lapka/contracts'
import { ApiError, type ApiClient } from '@lapka/shared'
import { queryKeys, type CacheKey } from '@/lib/query-keys'
import type { DoseCourse } from './doses'

/** Reads through the screens' cache: what it holds when fresh enough, the server otherwise. */
export type Read = <T>(key: CacheKey, load: () => Promise<T>) => Promise<T>
/** One call to the API, with the session refreshed if it has to be (`withFreshSession`). */
export type Call = <T>(fn: (api: ApiClient) => Promise<T>) => Promise<T>

export type ReminderAccountData = {
  due: DueItem[]
  pets: { id: string; name: string }[]
  courses: DoseCourse[]
  doses: MedicationDose[]
  followups: FollowupCaseSummary[]
}

/** How far ahead the dose reminders are planned (doses.ts). */
const DOSE_DAYS_AHEAD = 7

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

/**
 * Everything the phone's reminders are planned from, read under the same
 * keys the screens use. A record a screen loaded a moment ago is not asked
 * for again, and a record this read fetches is what the screen then shows;
 * the one a save just changed was invalidated by it, so it is read anew.
 *
 * A pet deleted meanwhile simply has nothing to remind of. Any other failure
 * stops the run, and the phone keeps the reminders it has: rebuilding without
 * this pet's medicines would drop them for the week with no word (PR #82
 * review). A server without the follow-up loop yet, or a failure of it, must
 * not cost the other reminders.
 */
export async function loadReminderAccount({ read, call, today }: { read: Read; call: Call; today: string }): Promise<ReminderAccountData> {
  const [due, pets, followups] = await Promise.all([
    read(queryKeys.due(), () => call((api) => api.listDue())),
    read(queryKeys.pets(), () => call((api) => api.listPets())),
    read(queryKeys.followups(), () => call((api) => api.listFollowups())).then(
      (list) => list.items,
      () => [] as FollowupCaseSummary[],
    ),
  ])
  const to = addDays(today, DOSE_DAYS_AHEAD)
  const records = await Promise.all(
    pets.map(async (pet) => {
      try {
        const overview = await read(queryKeys.overview(pet.id), () => call((api) => api.getHealthOverview(pet.id, today)))
        const timed = overview.medications.filter((course) => course.reminder_times.length > 0)
        if (timed.length === 0) return { courses: [] as DoseCourse[], doses: [] as MedicationDose[] }
        const doses = await read(queryKeys.doses(pet.id, today, to), () => call((api) => api.listDoses(pet.id, today, to)))
        return { courses: timed.map((course) => ({ pet: { id: pet.id, name: pet.name }, course })), doses }
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === 'not_found') return { courses: [] as DoseCourse[], doses: [] as MedicationDose[] }
        throw cause
      }
    }),
  )
  return {
    due,
    pets: pets.map((pet) => ({ id: pet.id, name: pet.name })),
    courses: records.flatMap((record) => record.courses),
    doses: records.flatMap((record) => record.doses),
    followups,
  }
}
