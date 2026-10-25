import type { HealthEvent, VisitInput, VisitKind, VisitPatch } from '@lapka/contracts'
import {
  heldVisitDay,
  planFields,
  readHeldVisit,
  readVisitPlanChange,
  type ContractRefusal as SharedRefusal,
  type FormRead,
  type VisitProblems as SharedVisitProblems,
} from '@lapka/shared'

// Reading the form is shared with the phone (@lapka/shared `form-readers.ts`):
// the same problems, as codes, and the same bodies.
export { readNewVisit, visitProblems } from '@lapka/shared'

/**
 * The visit form (web v1 «visit-done», «visit-plan», «visit-prescriptions»,
 * «visit-from-result», «visit-plan-edit», «visit-complete») as data, apart
 * from React so its rules are unit tested:
 *
 * - a new visit is «Был» today with nothing else filled in — no diagnosis,
 *   no prescription, no check; «Запланировать» starts without a day. From a
 *   check result it is «Болезнь», its first line as the reason, and that
 *   check linked — the only way a new visit gets a link without the owner
 *   choosing one;
 * - «Назначения» are added one at a time, each empty, up to ten; each is
 *   removed on its own. «Добавить в лекарства» is ticked on a new one (spec
 *   §7.11) and the owner unticks it before saving; only a ticked one starts
 *   a course, once, however often the save is sent;
 * - switching «Был» / «Запланировать» keeps what was typed; a plan sends no
 *   diagnosis and no prescriptions (they are kept aside, not lost);
 * - a plan is changed (only what changed is sent, its day only when moved)
 *   or marked «Состоялся», which sends it whole as a visit that happened;
 *   a visit that happened is never opened here (owner rule of 26 September
 *   2026).
 *
 * The day rule is the shared `eventDayProblem`, the limits the contract's
 * (`VISIT_LIMITS`, shared `prescriptionProblems` / `visitTextProblems`): the
 * phone checks the same. The contract's schemas have the last word.
 */

export type PrescriptionDraft = {
  /** Stable across renders and errors. */
  key: string
  name: string
  /** «Как принимать». */
  instructions: string
  /** «Добавить в лекарства»: start a course from it when the visit is saved. Ticked on a new one; the owner may untick it. */
  toMedicines: boolean
}

export type VisitDraft = {
  status: HealthEvent['status']
  /** yyyy-mm-dd, or '' before one is chosen. */
  date: string
  visitKind: VisitKind
  clinic: string
  reason: string
  /** Only a visit that happened has one; kept aside while «Запланировать» is chosen. */
  diagnosis: string
  /** Likewise. */
  prescriptions: PrescriptionDraft[]
  /** The check it follows; null for none. */
  checkId: string | null
  notes: string
}

/** A check result the visit is written from (spec §7.22): its id and the reason it suggests. */
export type VisitSource = { checkId: string; reason: string }

/** A new visit: «Был» today, empty — or, from a check result, «Болезнь» with its reason and that check. */
export function blankVisit(today: string, source: VisitSource | null = null): VisitDraft {
  return {
    status: 'done',
    date: today,
    visitKind: source ? 'illness' : 'checkup',
    clinic: '',
    reason: source?.reason ?? '',
    diagnosis: '',
    prescriptions: [],
    checkId: source?.checkId ?? null,
    notes: '',
  }
}

/** A plan as its change form opens it, exactly as saved (shared `planFields`). */
export function draftFromPlan(plan: HealthEvent): VisitDraft {
  return { ...planFields(plan), prescriptions: [] }
}

/**
 * «Состоялся» on a plan: what the plan said, as a visit that happened. Its
 * day is the planned one if that has come, otherwise today — the owner
 * corrects it to the real day.
 */
export function heldDraft(plan: HealthEvent, today: string): VisitDraft {
  return { ...draftFromPlan(plan), status: 'done', date: heldVisitDay(plan.date, today) }
}

/** «Был» / «Запланировать»: the day starts over (today / none); everything else is kept. */
export function switchVisitStatus(draft: VisitDraft, status: HealthEvent['status'], today: string): VisitDraft {
  if (draft.status === status) return draft
  return { ...draft, status, date: status === 'done' ? today : '' }
}

/**
 * A new prescription: empty, with «Добавить в лекарства» ticked (spec §7.11,
 * web v1 «visit-prescriptions»). The box is shown and the owner unticks it
 * before saving if the prescription is not a medicine to take — that visible
 * choice is theirs.
 */
export function blankPrescription(key: string): PrescriptionDraft {
  return { key, name: '', instructions: '', toMedicines: true }
}

export type VisitProblems = SharedVisitProblems

/** The contract refused a form the checks let through: said like a 400, never thrown. */
export type ContractRefusal = SharedRefusal<VisitProblems>

export type ReadVisit<T> = FormRead<T, VisitProblems>

/** The change to a plan: only what differs from it, `null` when nothing does; its day only when moved. */
export function readPlanChange(plan: HealthEvent, draft: VisitDraft, today: string): ReadVisit<VisitPatch | null> {
  return readVisitPlanChange(plan, draft, today)
}

/** «Состоялся»: the plan as a visit that happened, sent whole. Once saved it is only read. */
export function readHeld(plan: HealthEvent, draft: VisitDraft, today: string): ReadVisit<VisitPatch> {
  return readHeldVisit(plan, draft, today)
}

/** Whether leaving the form loses anything. */
export function visitDraftChanged(before: VisitDraft, after: VisitDraft): boolean {
  const shape = (draft: VisitDraft) =>
    JSON.stringify({ ...draft, prescriptions: draft.prescriptions.map(({ name, instructions, toMedicines }) => [name, instructions, toMedicines]) })
  return shape(before) !== shape(after)
}

/** Whether saving this form makes a visit that happened — which can never be changed afterwards. */
export function savesHeldVisit(draft: VisitDraft): boolean {
  return draft.status === 'done'
}
