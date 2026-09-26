import { VISIT_LIMITS, type HealthEvent } from '@lapka/contracts'
import { addInterval } from './catalog-search'
import { localToday } from './record-overview'

/**
 * The rules of a vet visit that the web and the phone share: which visit can
 * still be changed, what is wrong with a prescription or a text as typed,
 * which checks a visit may be linked to, and what a visit started from a
 * check result says. No UI and no text: each app says it in its own words.
 * The visit's day is checked by the shared `eventDayProblem` (event-entry.ts),
 * like any record's.
 */

/**
 * Whether a visit can still be changed or moved: only while it is planned.
 * A visit that happened is history — read, and deleted if it is wrong, never
 * corrected (owner rule of 26 September 2026); the server refuses the change
 * with `record_done`. Adding one of its prescriptions to the medicines is not
 * a change of the visit and stays possible.
 */
export function visitEditable(visit: Pick<HealthEvent, 'status'>): boolean {
  return visit.status === 'planned'
}

/**
 * The day a planned visit is marked «Состоялся» with by default: its planned
 * day if that has come, otherwise today — the owner corrects it to the real
 * day. Never after today: a visit that happened is not in the future.
 */
export function heldVisitDay(plannedDay: string, today: string): string {
  return plannedDay <= today ? plannedDay : today
}

export type PrescriptionProblems = { name?: 'empty' | 'tooLong'; instructions?: 'tooLong' }

/** What is wrong with one prescription as typed: a name is needed; both texts have the contract's limits. */
export function prescriptionProblems(prescription: { name: string; instructions: string }): PrescriptionProblems {
  const problems: PrescriptionProblems = {}
  const name = prescription.name.trim()
  if (name === '') problems.name = 'empty'
  else if (name.length > VISIT_LIMITS.prescriptionName) problems.name = 'tooLong'
  if (prescription.instructions.trim().length > VISIT_LIMITS.instructions) problems.instructions = 'tooLong'
  return problems
}

export type VisitTextField = 'clinic' | 'reason' | 'diagnosis' | 'notes'

/** The visit's texts that are longer than the contract keeps. */
export function visitTextProblems(texts: Partial<Record<VisitTextField, string>>): VisitTextField[] {
  return (['clinic', 'reason', 'diagnosis', 'notes'] as const).filter(
    (field) => (texts[field] ?? '').trim().length > VISIT_LIMITS[field],
  )
}

/** How far back a check may be picked for a visit: a visit follows a check soon after it (spec §7.11). */
export const CHECK_LINK_DAYS = 30

/**
 * The checks a visit may be linked to: those of the last 30 days by the
 * owner's own day, in the order given (newest first). The check the visit is
 * already linked to stays among them however old it is — an existing link is
 * kept, never silently dropped. `dayOf` turns a check's moment into the
 * owner's day; the device's zone by default.
 */
export function linkableChecks<Check extends { id: string; created_at: string }>(
  checks: readonly Check[],
  today: string,
  linked: string | null = null,
  dayOf: (iso: string) => string = (iso) => localToday(new Date(iso)),
): Check[] {
  const earliest = addInterval(today, { value: -CHECK_LINK_DAYS, unit: 'day' })
  return checks.filter((check) => check.id === linked || dayOf(check.created_at) >= earliest)
}

/**
 * «Причина» of a visit written from a check result (spec §7.22): the first
 * line the owner typed, trimmed to what the visit keeps. Empty when there is
 * nothing to say.
 */
export function reasonFromCheck(symptoms: string): string {
  const line = symptoms.split(/\r?\n/).map((part) => part.trim()).find((part) => part !== '') ?? ''
  return line.length > VISIT_LIMITS.reason ? line.slice(0, VISIT_LIMITS.reason).trimEnd() : line
}
