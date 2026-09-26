import type { HealthEvent, VisitInput, VisitKind } from '@lapka/contracts'
import { eventDayProblem, linkableChecks, prescriptionProblems, visitEditable } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { dayInput, localToday, parseDayText } from '@/lib/calendar-day'

/**
 * The visit form (M9) as text fields, and turning it into a request. A plan
 * sends no diagnosis and no prescriptions (MR-07.3); a prescription the visit
 * already has keeps its id and is never sent to the medicines again. The day
 * and length rules are the site's (@lapka/shared `eventDayProblem`,
 * `prescriptionProblems`); only a plan is changed — a visit that happened is
 * history (owner rule of 26 September 2026, `visitEditable`).
 */

export type PrescriptionDraft = {
  key: string
  id?: string
  name: string
  instructions: string
  /** New prescriptions only; one that has a course shows «В лекарствах» instead. */
  toMedicines: boolean
  inMedicines?: boolean
}

export type VisitDraft = {
  status: 'done' | 'planned'
  date: string
  visitKind: VisitKind
  clinic: string
  reason: string
  diagnosis: string
  prescriptions: PrescriptionDraft[]
  checkId: string | null
  notes: string
}

export function blankVisit(status: 'done' | 'planned', now: Date = new Date()): VisitDraft {
  return {
    status,
    date: status === 'done' ? dayInput(localToday(now)) : '',
    visitKind: status === 'done' ? 'illness' : 'checkup',
    clinic: '',
    reason: '',
    diagnosis: '',
    prescriptions: [],
    checkId: null,
    notes: '',
  }
}

/**
 * A visit as the form opens it: to correct, or — `as: 'done'` — to mark a
 * plan as having happened, today, with what the plan said.
 */
export function visitDraftFrom(event: HealthEvent, as?: 'done', now: Date = new Date()): VisitDraft {
  return {
    status: as ?? event.status,
    date: as === 'done' ? dayInput(localToday(now)) : dayInput(event.date),
    visitKind: event.visit_kind ?? 'other',
    clinic: event.clinic ?? '',
    reason: event.reason ?? '',
    diagnosis: event.diagnosis ?? '',
    prescriptions: event.items.map((item) => ({
      key: item.id,
      id: item.id,
      name: item.name ?? '',
      instructions: item.instructions ?? '',
      toMedicines: false,
      inMedicines: item.medication_id !== null,
    })),
    checkId: event.check_id,
    notes: event.notes ?? '',
  }
}

export type VisitErrors = { date?: string; prescriptions?: Record<string, string> }

export type ReadVisit = { ok: true; value: VisitInput } | { ok: false; errors: VisitErrors }

/**
 * Checks a visit may follow: those of the last 30 days by the phone's day,
 * and the one it is already linked to however old (shared `linkableChecks`).
 */
export function recentChecks<Check extends { id: string; created_at: string }>(
  checks: readonly Check[],
  now: Date = new Date(),
  linked: string | null = null,
): Check[] {
  return linkableChecks(checks, localToday(now), linked)
}

/** Whether the visit's form may open: a plan only; a visit that happened is read and deleted, never changed. */
export function visitLocked(visit: Pick<HealthEvent, 'status'>): boolean {
  return !visitEditable(visit)
}

/**
 * Whether saving makes a visit that happened, which cannot be changed
 * afterwards: a new «Был», or «Был» on a plan. The form warns first.
 */
export function warnsHeldIsFinal(mode: 'new' | 'edit' | 'done', status: VisitDraft['status']): boolean {
  return mode === 'done' || (mode === 'new' && status === 'done')
}

const clean = (text: string) => (text.trim() === '' ? null : text.trim())

/**
 * @param keptDate the visit's current day when editing: an overdue plan may
 * keep it; only a new day has to be ahead.
 */
export function readVisit(
  t: Dictionary,
  draft: VisitDraft,
  mode: 'new' | 'edit' | 'done',
  now: Date = new Date(),
  keptDate?: string,
): ReadVisit {
  const words = t.medicalRecord
  const errors: VisitErrors = {}

  // The day rules are shared with the site: done not after today, a plan not before it, an
  // overdue plan being changed may keep its own day.
  const typed = parseDayText(draft.date)
  const kept = mode === 'edit' ? (keptDate ?? null) : null
  const date = typed !== null && eventDayProblem(typed, draft.status, localToday(now), kept) === null ? typed : null
  if (!date) errors.date = draft.status === 'done' ? words.dateInvalid : words.plannedDateInvalid

  const done = draft.status === 'done'
  const prescriptionErrors: Record<string, string> = {}
  const prescriptions = done
    ? draft.prescriptions.map((item) => {
        const found = prescriptionProblems(item)
        if (found.name === 'empty') prescriptionErrors[item.key] = words.visits.nameRequired
        else if (found.name === 'tooLong') prescriptionErrors[item.key] = words.visits.nameTooLong
        else if (found.instructions) prescriptionErrors[item.key] = words.visits.instructionsTooLong
        return item.id
          ? { id: item.id, name: item.name.trim(), instructions: clean(item.instructions) }
          : { name: item.name.trim(), instructions: clean(item.instructions), add_to_medications: item.toMedicines }
      })
    : []
  if (Object.keys(prescriptionErrors).length > 0) errors.prescriptions = prescriptionErrors
  if (Object.keys(errors).length > 0 || !date) return { ok: false, errors }

  return {
    ok: true,
    value: {
      status: draft.status,
      date,
      visit_kind: draft.visitKind,
      clinic: clean(draft.clinic),
      notes: clean(draft.notes),
      reason: clean(draft.reason),
      diagnosis: done ? clean(draft.diagnosis) : null,
      check_id: draft.checkId,
      prescriptions,
    },
  }
}

/** «Последний — 2 августа, гастрит»: the last visit that happened and what it found. */
export function visitSummary(t: Dictionary, events: readonly HealthEvent[], today: string): string | null {
  const last = events
    .filter((event) => event.kind === 'visit' && event.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!last) return null
  const day = t.day(last.date, last.date.slice(0, 4) !== today.slice(0, 4))
  const what = last.diagnosis ?? (last.visit_kind ? t.medicalRecord.visits.kinds[last.visit_kind].split(' ')[0] : null)
  return what ? t.medicalRecord.visits.last(day, what) : t.medicalRecord.visits.lastDay(day)
}
