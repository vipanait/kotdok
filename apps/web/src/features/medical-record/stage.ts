import type { HealthEvent, HealthSection } from '@lapka/contracts'

/**
 * Which parts of the web medical record are built, stage by stage
 * (docs/plans/medical-record-web). A part that is off is not drawn at all:
 * no link to a page that does not exist, no button that pretends to save.
 * A stage switches its part on here once its acceptance is closed.
 */
export const MEDICAL_RECORD_STAGE = {
  /** MW-02: the weight page, adding and correcting measurements. */
  weight: true,
  /** MW-03: the vaccinations page, form, record view and catalogue. */
  vaccinations: true,
  /** MW-04: the parasites page and form. */
  parasites: true,
  /** MW-04: «Сделано» on a due date and the page with all of them. */
  due: true,
  /** MW-05: the medicines page and form. */
  medications: true,
  /** MW-06: the visits page and form, «Состоялся» on a planned visit, the visit from a check result. */
  visits: true,
  /** MW-07: the summary for the vet, its print and «Сохранить PDF» through the browser's print dialog. */
  vetSummary: true,
} as const

export type MedicalRecordStage = { readonly [K in keyof typeof MEDICAL_RECORD_STAGE]: boolean }

/** What «Добавить запись» offers, in the order of the chooser (spec §7.4). */
export const RECORD_TYPES = ['vaccination', 'parasite', 'visit', 'medication', 'weight'] as const

export type RecordType = (typeof RECORD_TYPES)[number]

/** The section a new record of a type lands in. */
export const RECORD_TYPE_SECTION: Record<RecordType, HealthSection> = {
  vaccination: 'vaccinations',
  parasite: 'parasites',
  visit: 'visits',
  medication: 'medications',
  weight: 'weight',
}

/**
 * A section is open when this site has built it and the server can store it:
 * `writable` is the server's word, the stage is ours. Both are needed — an
 * older server must not get a form it cannot save.
 */
export function sectionOpen(
  section: HealthSection,
  writable: readonly HealthSection[] | null,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
): boolean {
  return stage[section] && (writable === null || writable.includes(section))
}

/** `?type=` of the new-record page, read strictly: anything else is no type. */
export function parseRecordType(value: string | string[] | undefined): RecordType | null {
  return typeof value === 'string' && (RECORD_TYPES as readonly string[]).includes(value) ? (value as RecordType) : null
}

/** The record types «Добавить запись» may offer. None means no button at all. */
export function addableRecordTypes(
  writable: readonly HealthSection[] | null,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
): RecordType[] {
  return RECORD_TYPES.filter((type) => sectionOpen(RECORD_TYPE_SECTION[type], writable, stage))
}

/** Whether a saved vaccination or treatment can be opened: its section's stage is done. */
export function recordKindOpen(kind: 'vaccination' | 'parasite', stage: MedicalRecordStage = MEDICAL_RECORD_STAGE): boolean {
  return stage[RECORD_TYPE_SECTION[kind]]
}

/**
 * Whether «Сделано» is offered for a plan of this kind: the due stage and the
 * kind's own. A planned visit is marked «Состоялся» on its own form instead
 * (`heldOpen`, MW-06).
 */
export function completeOpen(kind: HealthEvent['kind'], stage: MedicalRecordStage = MEDICAL_RECORD_STAGE): boolean {
  return kind !== 'visit' && stage.due && recordKindOpen(kind, stage)
}

/** Whether «Состоялся» is offered for a planned visit — in its view and among the due dates. */
export function heldOpen(stage: MedicalRecordStage = MEDICAL_RECORD_STAGE): boolean {
  return stage.visits
}

/** Where «Сделано» was pressed: where its form goes back to. */
export const COMPLETE_FROM = ['record', 'due', 'medical', 'section'] as const
export type CompleteFrom = (typeof COMPLETE_FROM)[number]

export function parseCompleteFrom(value: string | string[] | undefined): CompleteFrom {
  return typeof value === 'string' && (COMPLETE_FROM as readonly string[]).includes(value) ? (value as CompleteFrom) : 'record'
}

/** Where each part of the record lives (implementation-handoff.md, «Маршруты»). */
export const medicalRecordHref = {
  record: (petId: string) => `/pets/${petId}`,
  form: (petId: string) => `/pets/${petId}/edit`,
  section: (petId: string, section: HealthSection) => `/pets/${petId}/health/${section}`,
  due: (petId: string) => `/pets/${petId}/health/due`,
  /** «Что добавить?»: the record types that are open (MW-02 onwards). */
  add: (petId: string) => `/pets/${petId}/health/new`,
  /** The form for a new record of a type. */
  newRecord: (petId: string, type: RecordType) => `/pets/${petId}/health/new?type=${type}`,
  /** One saved record; a record id is a UUID, never a section's name. */
  recordView: (petId: string, recordId: string) => `/pets/${petId}/health/${recordId}`,
  recordEdit: (petId: string, recordId: string) => `/pets/${petId}/health/${recordId}/edit`,
  /**
   * «Сделано» on a plan: one item of it. Without an item, a plan of several
   * asks which one was done; the other items stay planned.
   */
  complete: (petId: string, recordId: string, itemId: string | null, from: CompleteFrom = 'record') => {
    const query = [itemId ? `item=${itemId}` : null, from === 'record' ? null : `from=${from}`].filter(Boolean).join('&')
    return `/pets/${petId}/health/${recordId}/complete${query ? `?${query}` : ''}`
  },
  vetSummary: (petId: string) => `/pets/${petId}/vet-summary`,
}
