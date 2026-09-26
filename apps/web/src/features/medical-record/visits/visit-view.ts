import type { HealthEvent, HealthOverview, HealthSection, SymptomCheckRecord, Urgency } from '@lapka/contracts'
import { doneEvents, localToday, plannedEvents, visitEditable, type DueTone } from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { urgencyTitle } from '@/shared/utils/urgency'
import { formatCount } from '@/shared/i18n/plural'
import { MEDICAL_RECORD_STAGE, medicalRecordHref, sectionOpen, type MedicalRecordStage } from '../stage'
import { dueStatusText, formatDay, recordDay } from '../view-model'

/**
 * The visits page (web v1 «visits», «visits-empty») and one visit
 * («visit-record», «visit-planned»), worked out from the overview and the
 * pet's checks. No React, so the rules are unit tested: plans soonest first,
 * visits that happened newest first; a visit linked to a check says which,
 * with its urgency, and leads back to it; a visit that happened offers no
 * change — only deletion, and its prescriptions can still go to the medicines.
 */

type Words = Dictionary['medicalRecord']

/** A check's moment as the owner's calendar day: the browser's own zone. */
export const checkDayOf = (iso: string) => localToday(new Date(iso))

/** «По проверке 1 августа · Наблюдаем», and where it leads. */
export type CheckLink = {
  href: string
  /** «По проверке 1 августа»; without the day when the check is not among the loaded ones. */
  text: string
  urgency: Urgency | null
  /** The urgency's name, «Наблюдаем». */
  urgencyText: string | null
}

export function checkLink(
  dict: Dictionary,
  checkId: string,
  checks: readonly SymptomCheckRecord[],
  today: string,
  dayOf: (iso: string) => string = checkDayOf,
): CheckLink {
  const words = dict.medicalRecord.visitsPage
  const check = checks.find((entry) => entry.id === checkId) ?? null
  return {
    href: `/check/${checkId}`,
    text: check ? words.byCheck.replace('{day}', recordDay(dict.medicalRecord, dayOf(check.created_at), today)) : words.linkedCheck,
    urgency: check?.urgency ?? null,
    urgencyText: check ? urgencyTitle(dict.urgency[check.urgency]?.label) : null,
  }
}

/** «Осмотр», «Болезнь» — the short kind of the card's pill. */
function shortKind(words: Words, visit: HealthEvent): string {
  return visit.visit_kind ? words.visits.kinds[visit.visit_kind] : words.due.visit
}

/** The first line of a text: a card shows one. */
const firstLine = (text: string | null) => text?.split(/\r?\n/).find((line) => line.trim() !== '')?.trim() ?? null

export type VisitCard = {
  id: string
  href: string
  /** «3 октября 2026»: always with its year. */
  day: string
  kind: string
  clinic: string | null
  /** The diagnosis of a visit that happened, else its reason — the first line. */
  summary: string | null
  due: { text: string; tone: DueTone } | null
  check: CheckLink | null
  /** Everything the card says, for the link's accessible name. */
  label: string
}

export type VisitsPageView = {
  subtitle: string
  planned: VisitCard[]
  done: VisitCard[]
  empty: boolean
}

function card(
  dict: Dictionary,
  locale: Locale,
  petId: string,
  visit: HealthEvent,
  checks: readonly SymptomCheckRecord[],
  today: string,
  dayOf: (iso: string) => string,
): VisitCard {
  const words = dict.medicalRecord
  const day = formatDay(words, visit.date, true)
  const status = visit.status === 'planned' ? dueStatusText(dict, locale, visit.date, today) : null
  const due = status && status.tone !== 'later' ? status : null
  const summary = firstLine(visit.status === 'done' ? (visit.diagnosis ?? visit.reason) : visit.reason)
  const check = visit.check_id ? checkLink(dict, visit.check_id, checks, today, dayOf) : null
  const kind = shortKind(words, visit)
  return {
    id: visit.id,
    href: medicalRecordHref.recordView(petId, visit.id),
    day,
    kind,
    clinic: visit.clinic,
    summary,
    due,
    check,
    label: [day, due?.text, [kind, visit.clinic].filter(Boolean).join(' · '), summary, check && [check.text, check.urgencyText].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join('. '),
  }
}

export function visitsPage(
  dict: Dictionary,
  locale: Locale,
  overview: HealthOverview,
  checks: readonly SymptomCheckRecord[],
  today: string,
  dayOf: (iso: string) => string = checkDayOf,
): VisitsPageView {
  const petId = overview.pet.id
  const planned = [...plannedEvents(overview.events, 'visit')].sort((a, b) => a.date.localeCompare(b.date))
  const done = [...doneEvents(overview.events, 'visit')].sort((a, b) => b.date.localeCompare(a.date))
  return {
    subtitle: dict.medicalRecord.visitsPage.subtitle.replace('{name}', overview.pet.name),
    planned: planned.map((visit) => card(dict, locale, petId, visit, checks, today, dayOf)),
    done: done.map((visit) => card(dict, locale, petId, visit, checks, today, dayOf)),
    empty: planned.length === 0 && done.length === 0,
  }
}

// ---------- One visit ----------

export type PrescriptionView = {
  id: string
  name: string
  instructions: string | null
  /** The course it started, while the link lasts: «В лекарствах». */
  courseHref: string | null
  /** «Добавить в лекарства»: a prescription of a visit that happened with no course yet. */
  addable: boolean
}

export type VisitRecordView = {
  status: HealthEvent['status']
  badge: string
  day: string
  /** «Осмотр или профилактика»: the full kind. */
  kind: string
  due: { text: string; tone: DueTone } | null
  clinic: string | null
  reason: string | null
  diagnosis: string | null
  notes: string | null
  prescriptions: PrescriptionView[]
  /** «Посмотреть лекарства» under the prescriptions, once any of them is a course. */
  coursesHref: string | null
  check: CheckLink | null
  actionsBody: string
  /** «Состоялся»: a plan, where the server stores visits. */
  heldHref: string | null
  /** «Изменить»: a plan only (owner rule of 26 September 2026). */
  editHref: string | null
  removable: boolean
  sectionHref: string
  removeTitle: string
  prescriptionsCount: string | null
}

export function visitRecord(
  dict: Dictionary,
  locale: Locale,
  petId: string,
  visit: HealthEvent,
  checks: readonly SymptomCheckRecord[],
  today: string,
  writable: readonly HealthSection[] | null = null,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
  dayOf: (iso: string) => string = checkDayOf,
): VisitRecordView {
  if (visit.kind !== 'visit') throw new Error('not a visit')
  const words = dict.medicalRecord
  const view = words.visitRecord
  const planned = visit.status === 'planned'
  const writes = sectionOpen('visits', writable, stage)
  const medicines = sectionOpen('medications', writable, stage)
  const editable = writes && visitEditable(visit)
  const day = formatDay(words, visit.date, true)
  const status = planned ? dueStatusText(dict, locale, visit.date, today) : null
  const prescriptions = visit.items.map((item) => ({
    id: item.id,
    name: item.name ?? '',
    instructions: item.instructions,
    courseHref: item.medication_id ? medicalRecordHref.recordView(petId, item.medication_id) : null,
    addable: !planned && item.medication_id === null && item.name !== null && medicines,
  }))
  return {
    status: visit.status,
    badge: planned ? view.plannedBadge : view.doneBadge,
    day,
    kind: visit.visit_kind ? words.visitForm.kinds[visit.visit_kind] : words.due.visit,
    due: status && status.tone !== 'later' ? status : null,
    clinic: visit.clinic,
    reason: visit.reason,
    diagnosis: visit.diagnosis,
    notes: visit.notes,
    prescriptions,
    coursesHref: prescriptions.some((item) => item.courseHref) ? medicalRecordHref.section(petId, 'medications') : null,
    check: visit.check_id ? checkLink(dict, visit.check_id, checks, today, dayOf) : null,
    actionsBody: planned ? view.plannedBody : view.doneBody,
    heldHref: editable ? medicalRecordHref.complete(petId, visit.id, null) : null,
    editHref: editable ? medicalRecordHref.recordEdit(petId, visit.id) : null,
    removable: writes,
    sectionHref: medicalRecordHref.section(petId, 'visits'),
    removeTitle: (planned ? view.cancelTitle : view.deleteTitle).replace('{day}', day),
    prescriptionsCount: prescriptions.length > 0 ? formatCount(words.visitsPage.prescriptions, prescriptions.length, locale) : null,
  }
}

/** `?saved=` on the visit pages after a save or a delete: a one-time confirmation. */
export const VISIT_SAVED = ['added', 'changed', 'held', 'deleted', 'cancelled'] as const
export type VisitSaved = (typeof VISIT_SAVED)[number]

export function parseVisitSaved(value: string | string[] | undefined): VisitSaved | null {
  return typeof value === 'string' && (VISIT_SAVED as readonly string[]).includes(value) ? (value as VisitSaved) : null
}
