import {
  VISIT_LIMITS,
  VisitInputSchema,
  VisitPatchSchema,
  type HealthEvent,
  type VisitInput,
  type VisitKind,
  type VisitPatch,
} from '@lapka/contracts'
import {
  eventDayProblem,
  prescriptionProblems,
  visitTextProblems,
  type EventDayProblem,
  type PrescriptionProblems,
  type VisitTextField,
} from '@lapka/shared'

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
 *   removed on its own. A prescription becomes a medicine only when the
 *   owner ticks «Добавить в лекарства»: never by default;
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
  /** «Добавить в лекарства»: start a course from it when the visit is saved. Off until the owner ticks it. */
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

/** A plan as its change form opens it, exactly as saved. */
export function draftFromPlan(plan: HealthEvent): VisitDraft {
  if (plan.kind !== 'visit' || plan.status !== 'planned') throw new Error('only a planned visit is changed')
  return {
    status: 'planned',
    date: plan.date,
    visitKind: plan.visit_kind ?? 'other',
    clinic: plan.clinic ?? '',
    reason: plan.reason ?? '',
    diagnosis: '',
    prescriptions: [],
    checkId: plan.check_id,
    notes: plan.notes ?? '',
  }
}

/**
 * «Состоялся» on a plan: what the plan said, as a visit that happened. Its
 * day is the planned one if that has come, otherwise today — the owner
 * corrects it to the real day.
 */
export function heldDraft(plan: HealthEvent, today: string): VisitDraft {
  return { ...draftFromPlan(plan), status: 'done', date: plan.date <= today ? plan.date : today }
}

/** «Был» / «Запланировать»: the day starts over (today / none); everything else is kept. */
export function switchVisitStatus(draft: VisitDraft, status: HealthEvent['status'], today: string): VisitDraft {
  if (draft.status === status) return draft
  return { ...draft, status, date: status === 'done' ? today : '' }
}

export function blankPrescription(key: string): PrescriptionDraft {
  return { key, name: '', instructions: '', toMedicines: false }
}

export type VisitProblems = {
  date?: EventDayProblem
  texts?: VisitTextField[]
  prescriptions?: 'tooMany'
  prescription?: Record<string, PrescriptionProblems>
}

/** The contract refused a form the checks let through: said like a 400, never thrown. */
export type ContractRefusal = { ok: false; rejected: true; problems: VisitProblems }

export type ReadVisit<T> = { ok: true; value: T } | { ok: false; rejected?: false; problems: VisitProblems } | ContractRefusal

const refused: ContractRefusal = { ok: false, rejected: true, problems: {} }
const orNull = (text: string) => (text.trim() === '' ? null : text.trim())
const hasProblems = (problems: VisitProblems) => Object.keys(problems).length > 0

function problemsOf(draft: VisitDraft, today: string, keptDay: string | null): VisitProblems {
  const problems: VisitProblems = {}
  const date = eventDayProblem(draft.date, draft.status, today, keptDay)
  if (date) problems.date = date

  const done = draft.status === 'done'
  const texts = visitTextProblems({
    clinic: draft.clinic,
    reason: draft.reason,
    notes: draft.notes,
    ...(done ? { diagnosis: draft.diagnosis } : {}),
  })
  if (texts.length > 0) problems.texts = texts

  if (done) {
    if (draft.prescriptions.length > VISIT_LIMITS.prescriptions) problems.prescriptions = 'tooMany'
    const own: Record<string, PrescriptionProblems> = {}
    for (const prescription of draft.prescriptions) {
      const found = prescriptionProblems(prescription)
      if (Object.keys(found).length > 0) own[prescription.key] = found
    }
    if (Object.keys(own).length > 0) problems.prescription = own
  }
  return problems
}

function prescriptionsOf(draft: VisitDraft): NonNullable<VisitInput['prescriptions']> {
  return draft.prescriptions.map((prescription) => ({
    name: prescription.name.trim(),
    instructions: orNull(prescription.instructions),
    add_to_medications: prescription.toMedicines,
  }))
}

/** The body of a new visit, or what is wrong with the form. */
export function readNewVisit(draft: VisitDraft, today: string): ReadVisit<VisitInput> {
  const problems = problemsOf(draft, today, null)
  if (hasProblems(problems)) return { ok: false, problems }
  const done = draft.status === 'done'
  const parsed = VisitInputSchema.safeParse({
    status: draft.status,
    date: draft.date,
    visit_kind: draft.visitKind,
    clinic: orNull(draft.clinic),
    reason: orNull(draft.reason),
    notes: orNull(draft.notes),
    check_id: draft.checkId,
    ...(done ? { diagnosis: orNull(draft.diagnosis), prescriptions: prescriptionsOf(draft) } : {}),
  })
  return parsed.success ? { ok: true, value: parsed.data } : refused
}

/**
 * The change to a plan: only what differs from it, `null` when nothing does.
 * Its day is sent only when moved — an overdue plan keeps its own day.
 */
export function readPlanChange(plan: HealthEvent, draft: VisitDraft, today: string): ReadVisit<VisitPatch | null> {
  const before = draftFromPlan(plan)
  const problems = problemsOf(draft, today, plan.date)
  if (hasProblems(problems)) return { ok: false, problems }

  const patch: VisitPatch = {}
  if (draft.date !== before.date) patch.date = draft.date
  if (draft.visitKind !== before.visitKind) patch.visit_kind = draft.visitKind
  if (orNull(draft.clinic) !== orNull(before.clinic)) patch.clinic = orNull(draft.clinic)
  if (orNull(draft.reason) !== orNull(before.reason)) patch.reason = orNull(draft.reason)
  if (orNull(draft.notes) !== orNull(before.notes)) patch.notes = orNull(draft.notes)
  if (draft.checkId !== before.checkId) patch.check_id = draft.checkId
  if (Object.keys(patch).length === 0) return { ok: true, value: null }

  const parsed = VisitPatchSchema.safeParse(patch)
  return parsed.success ? { ok: true, value: parsed.data } : refused
}

/**
 * «Состоялся»: the plan as a visit that happened, sent whole — its real day
 * (not after today), what was found and prescribed. Once saved it is only
 * read.
 */
export function readHeld(plan: HealthEvent, draft: VisitDraft, today: string): ReadVisit<VisitPatch> {
  if (plan.status !== 'planned') throw new Error('only a plan is marked held')
  const held = { ...draft, status: 'done' as const }
  const problems = problemsOf(held, today, null)
  if (hasProblems(problems)) return { ok: false, problems }
  const parsed = VisitPatchSchema.safeParse({
    status: 'done',
    date: held.date,
    visit_kind: held.visitKind,
    clinic: orNull(held.clinic),
    reason: orNull(held.reason),
    diagnosis: orNull(held.diagnosis),
    notes: orNull(held.notes),
    check_id: held.checkId,
    prescriptions: prescriptionsOf(held),
  })
  return parsed.success ? { ok: true, value: parsed.data } : refused
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
