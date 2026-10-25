import {
  HEALTH_EVENT_LIMITS,
  HealthEventInputSchema,
  MEDICATION_LIMITS,
  MedicationPatchSchema,
  MedicationsInputSchema,
  VISIT_LIMITS,
  VisitInputSchema,
  VisitPatchSchema,
  type HealthEvent,
  type HealthEventInput,
  type HealthEventPatch,
  type HealthTarget,
  type Medication,
  type MedicationPatch,
  type MedicationsInput,
  type VisitInput,
  type VisitKind,
  type VisitPatch,
} from '@lapka/contracts'
import { courseDayProblems, startMayStayEmpty, type CourseDayProblems } from './course-entry'
import { eventDayProblem, eventTextProblems, itemNameTooLong, nextDayProblem, tooManyItems, type EventDayProblem, type NextDayProblem } from './event-entry'
import { prescriptionProblems, visitTextProblems, type PrescriptionProblems, type VisitTextField } from './visit-entry'

/**
 * The record forms, read once for the site and the phone: what is wrong
 * with the fields, as codes, and the body the contract takes. Each app
 * parses its own text fields into these (a typed «24.09.2026» into
 * `YYYY-MM-DD`, a «через год» choice into a day) and says the codes in its
 * own words; the contract's schemas have the last word before anything is
 * sent. The day and length rules are the ones already shared
 * (`eventDayProblem`, `courseDayProblems`, `prescriptionProblems`, …).
 */

const orNull = (text: string) => (text.trim() === '' ? null : text.trim())
const hasKeys = (value: object) => Object.keys(value).length > 0

/** The form built something the contract refuses: said like the server's 400, never thrown. */
export type ContractRefusal<P> = { ok: false; rejected: true; problems: P }

export type FormRead<T, P> = { ok: true; value: T } | { ok: false; rejected?: false; problems: P } | ContractRefusal<P>

// ---------- Vaccinations and treatments ----------

export type EventItemFields = {
  /** Stable across renders and errors. */
  key: string
  /** An item the record already has: the server keeps it. */
  id?: string
  name: string
  targets: readonly string[]
  productId: string | null
  /** The next one, done records only: `YYYY-MM-DD`, '' for none, anything else typed (not a day). */
  next: string
}

export type EventFields = {
  kind: HealthEventInput['kind']
  status: HealthEvent['status']
  /** `YYYY-MM-DD`, '' before one is chosen, anything else typed (not a day). */
  date: string
  items: readonly EventItemFields[]
  clinic: string
  notes: string
}

export type EventItemProblems = {
  /** Neither a name nor a disease: the contract needs one of them. */
  empty?: true
  name?: 'tooLong'
  next?: NextDayProblem
}

export type EventProblems = {
  date?: EventDayProblem
  items?: 'none' | 'tooMany'
  item?: Record<string, EventItemProblems>
  clinic?: 'tooLong'
  notes?: 'tooLong'
}

export type EventReadOptions = {
  /** The record's current day when a plan is corrected: an overdue plan may keep it; only a new day has to be ahead. */
  keptDate: string | null
  /** Whether the items' next dates are read: a new done record and «Сделано» take them, a correction does not. */
  withNext: boolean
}

function eventItemProblems(item: EventItemFields, date: string, today: string, withNext: boolean): EventItemProblems {
  const problems: EventItemProblems = {}
  const name = item.name.trim()
  if (name === '' && item.targets.length === 0) problems.empty = true
  else if (itemNameTooLong(name)) problems.name = 'tooLong'
  if (withNext && item.next !== '') {
    const next = nextDayProblem(item.next, date || null, today)
    if (next) problems.next = next
  }
  return problems
}

export function eventProblems(fields: EventFields, today: string, options: EventReadOptions): EventProblems {
  const problems: EventProblems = {}
  const date = eventDayProblem(fields.date, fields.status, today, options.keptDate)
  if (date) problems.date = date

  if (fields.items.length === 0) problems.items = 'none'
  else if (tooManyItems(fields.items)) problems.items = 'tooMany'

  const withNext = options.withNext && fields.status === 'done'
  const byKey: Record<string, EventItemProblems> = {}
  for (const item of fields.items) {
    // Against a day that is not wrong; otherwise the next date is only checked to be a day.
    const found = eventItemProblems(item, problems.date ? '' : fields.date, today, withNext)
    if (hasKeys(found)) byKey[item.key] = found
  }
  if (hasKeys(byKey)) problems.item = byKey
  for (const field of eventTextProblems(fields)) problems[field] = 'tooLong'
  return problems
}

export type ReadEvent = { ok: true; input: HealthEventInput } | { ok: false; rejected?: false; problems: EventProblems } | ContractRefusal<EventProblems>

/** The body of a record, or what is wrong with the form. */
export function readEventInput(fields: EventFields, today: string, options: EventReadOptions): ReadEvent {
  const problems = eventProblems(fields, today, options)
  if (hasKeys(problems)) return { ok: false, problems }
  const withNext = options.withNext && fields.status === 'done'
  const parsed = HealthEventInputSchema.safeParse({
    kind: fields.kind,
    status: fields.status,
    date: fields.date,
    clinic: orNull(fields.clinic),
    notes: orNull(fields.notes),
    items: fields.items.map((item) => ({
      name: orNull(item.name),
      targets: item.targets as HealthTarget[],
      product_id: item.productId,
      ...(withNext ? { next_on: item.next === '' ? null : item.next } : {}),
    })),
  })
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, rejected: true, problems: {} }
}

export type EventPatchItem = NonNullable<HealthEventPatch['items']>[number]

/** The items of a correction: a kept one by its id, a new one without; no next dates (a correction takes none). */
export function eventPatchItems(fields: Pick<EventFields, 'items'>): EventPatchItem[] {
  return fields.items.map((item) => ({
    ...(item.id ? { id: item.id } : {}),
    name: orNull(item.name),
    targets: item.targets as HealthTarget[],
    product_id: item.productId,
  }))
}

/** How many items a record takes, for «+ Ещё». */
export const EVENT_ITEMS_MAX = HEALTH_EVENT_LIMITS.items

// ---------- Courses ----------

export type CourseFields = {
  key: string
  name: string
  dosage: string
  /** `YYYY-MM-DD`, '' when none is given, anything else typed (not a day). */
  start: string
  /** Likewise; not read while `ongoing`. */
  end: string
  ongoing: boolean
}

export type CourseProblems = { name?: 'empty' | 'tooLong'; dosage?: 'tooLong' } & CourseDayProblems

export type CoursesProblems = {
  items?: 'none' | 'tooMany'
  course?: Record<string, CourseProblems>
}

/** Checked like the server: texts within the contract's limits, a start unless it may stay unknown, an end not before it. */
export function courseProblems(fields: CourseFields, startOptional: boolean): CourseProblems {
  const problems: CourseProblems = { ...courseDayProblems(fields, startOptional) }
  const name = fields.name.trim()
  if (name === '') problems.name = 'empty'
  else if (name.length > MEDICATION_LIMITS.name) problems.name = 'tooLong'
  if (fields.dosage.trim().length > MEDICATION_LIMITS.dosage) problems.dosage = 'tooLong'
  return problems
}

/** One course as the contract takes it: empty texts and days are none, «Постоянно» has no end. */
export function courseValue(fields: CourseFields): MedicationsInput['items'][number] {
  const dosage = fields.dosage.trim()
  return {
    name: fields.name.trim(),
    dosage: dosage === '' ? null : dosage,
    started_on: fields.start === '' ? null : fields.start,
    ended_on: fields.ongoing || fields.end === '' ? null : fields.end,
    ongoing: fields.ongoing,
  }
}

/** The new courses of one save, all of them or none. */
export function readNewCourses(courses: readonly CourseFields[]): FormRead<MedicationsInput, CoursesProblems> {
  if (courses.length === 0) return { ok: false, problems: { items: 'none' } }
  if (courses.length > MEDICATION_LIMITS.items) return { ok: false, problems: { items: 'tooMany' } }
  const course: Record<string, CourseProblems> = {}
  for (const fields of courses) {
    const found = courseProblems(fields, false)
    if (hasKeys(found)) course[fields.key] = found
  }
  if (hasKeys(course)) return { ok: false, problems: { course } }
  const parsed = MedicationsInputSchema.safeParse({ items: courses.map(courseValue) })
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, rejected: true, problems: {} }
}

/**
 * A correction of a current course: only what changed, or `null` when
 * nothing did. A course from the pet form with no known start may keep it
 * unknown (`startMayStayEmpty`).
 */
export function readCourseChange(course: Medication, fields: CourseFields): FormRead<MedicationPatch | null, CoursesProblems> {
  const found = courseProblems(fields, startMayStayEmpty(course))
  if (hasKeys(found)) return { ok: false, problems: { course: { [fields.key]: found } } }
  const next = courseValue(fields)
  const patch: MedicationPatch = {}
  if (next.name !== course.name.trim()) patch.name = next.name
  if ((next.dosage ?? null) !== course.dosage) patch.dosage = next.dosage
  if ((next.started_on ?? null) !== course.started_on) patch.started_on = next.started_on
  if ((next.ended_on ?? null) !== course.ended_on) patch.ended_on = next.ended_on
  if (next.ongoing !== course.ongoing) patch.ongoing = next.ongoing
  if (!hasKeys(patch)) return { ok: true, value: null }
  const parsed = MedicationPatchSchema.safeParse(patch)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, rejected: true, problems: {} }
}

// ---------- Visits ----------

export type PrescriptionFields = {
  key: string
  /** A prescription the visit already has: kept by its id, never sent to the medicines again. */
  id?: string
  name: string
  instructions: string
  /** «Добавить в лекарства»: start a course from it. New prescriptions only. */
  toMedicines: boolean
}

export type VisitFields = {
  status: HealthEvent['status']
  /** `YYYY-MM-DD`, '' before one is chosen, anything else typed (not a day). */
  date: string
  visitKind: VisitKind
  clinic: string
  reason: string
  /** Only a visit that happened has one; whatever a plan's field holds is not read. */
  diagnosis: string
  /** Likewise. */
  prescriptions: readonly PrescriptionFields[]
  checkId: string | null
  notes: string
}

export type VisitProblems = {
  date?: EventDayProblem
  texts?: VisitTextField[]
  prescriptions?: 'tooMany'
  prescription?: Record<string, PrescriptionProblems>
}

export function visitProblems(fields: VisitFields, today: string, keptDay: string | null): VisitProblems {
  const problems: VisitProblems = {}
  const date = eventDayProblem(fields.date, fields.status, today, keptDay)
  if (date) problems.date = date

  const done = fields.status === 'done'
  const texts = visitTextProblems({
    clinic: fields.clinic,
    reason: fields.reason,
    notes: fields.notes,
    ...(done ? { diagnosis: fields.diagnosis } : {}),
  })
  if (texts.length > 0) problems.texts = texts

  if (done) {
    if (fields.prescriptions.length > VISIT_LIMITS.prescriptions) problems.prescriptions = 'tooMany'
    const own: Record<string, PrescriptionProblems> = {}
    for (const prescription of fields.prescriptions) {
      const found = prescriptionProblems(prescription)
      if (hasKeys(found)) own[prescription.key] = found
    }
    if (hasKeys(own)) problems.prescription = own
  }
  return problems
}

/** The prescriptions as the contract takes them: a kept one by its id, a new one with its «в лекарства». */
export function prescriptionValues(fields: VisitFields): NonNullable<VisitInput['prescriptions']> {
  return fields.prescriptions.map((prescription) =>
    prescription.id
      ? { id: prescription.id, name: prescription.name.trim(), instructions: orNull(prescription.instructions) }
      : { name: prescription.name.trim(), instructions: orNull(prescription.instructions), add_to_medications: prescription.toMedicines },
  )
}

/** A visit's fields as the contract takes them; a plan carries no diagnosis and no prescriptions. */
export function visitValue(fields: VisitFields): VisitInput {
  const done = fields.status === 'done'
  return {
    status: fields.status,
    date: fields.date,
    visit_kind: fields.visitKind,
    clinic: orNull(fields.clinic),
    reason: orNull(fields.reason),
    notes: orNull(fields.notes),
    check_id: fields.checkId,
    ...(done ? { diagnosis: orNull(fields.diagnosis), prescriptions: prescriptionValues(fields) } : {}),
  }
}

/** The body of a new visit, or what is wrong with the form. */
export function readNewVisit(fields: VisitFields, today: string): FormRead<VisitInput, VisitProblems> {
  const problems = visitProblems(fields, today, null)
  if (hasKeys(problems)) return { ok: false, problems }
  const parsed = VisitInputSchema.safeParse(visitValue(fields))
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, rejected: true, problems: {} }
}

/** A plan's fields as its change form opens them, for `readVisitPlanChange` to compare against. */
export function planFields(plan: HealthEvent): VisitFields {
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

/** The change to a plan: only what differs from it, `null` when nothing does; its day only when moved. */
export function readVisitPlanChange(plan: HealthEvent, fields: VisitFields, today: string): FormRead<VisitPatch | null, VisitProblems> {
  const before = planFields(plan)
  const problems = visitProblems(fields, today, plan.date)
  if (hasKeys(problems)) return { ok: false, problems }
  const patch: VisitPatch = {}
  if (fields.date !== before.date) patch.date = fields.date
  if (fields.visitKind !== before.visitKind) patch.visit_kind = fields.visitKind
  if (orNull(fields.clinic) !== orNull(before.clinic)) patch.clinic = orNull(fields.clinic)
  if (orNull(fields.reason) !== orNull(before.reason)) patch.reason = orNull(fields.reason)
  if (orNull(fields.notes) !== orNull(before.notes)) patch.notes = orNull(fields.notes)
  if (fields.checkId !== before.checkId) patch.check_id = fields.checkId
  if (!hasKeys(patch)) return { ok: true, value: null }
  const parsed = VisitPatchSchema.safeParse(patch)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, rejected: true, problems: {} }
}

/** «Состоялся»: the plan as a visit that happened, sent whole — its real day, what was found and prescribed. */
export function readHeldVisit(plan: HealthEvent, fields: VisitFields, today: string): FormRead<VisitPatch, VisitProblems> {
  if (plan.status !== 'planned') throw new Error('only a plan is marked held')
  const held: VisitFields = { ...fields, status: 'done' }
  const problems = visitProblems(held, today, null)
  if (hasKeys(problems)) return { ok: false, problems }
  const value = visitValue(held)
  const parsed = VisitPatchSchema.safeParse({ ...value, diagnosis: value.diagnosis ?? null, prescriptions: value.prescriptions ?? [] })
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, rejected: true, problems: {} }
}
