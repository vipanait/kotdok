/**
 * Where each part of the web medical record lives and what a page's query
 * says, read strictly. What the owner may do in a section is the server's
 * word (`writable` of the overview), not the site's.
 */

import { UuidSchema, type HealthSection } from '@lapka/contracts'

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
 * Whether the server stores records of a section — its `writable` list
 * (spec §2.2): an older server gets no form, button or link that would fail.
 */
export function sectionOpen(section: HealthSection, writable: readonly HealthSection[]): boolean {
  return writable.includes(section)
}

/** `?type=` of the new-record page, read strictly: anything else is no type. */
export function parseRecordType(value: string | string[] | undefined): RecordType | null {
  return typeof value === 'string' && (RECORD_TYPES as readonly string[]).includes(value) ? (value as RecordType) : null
}

/** The record types «Добавить запись» may offer: those the server stores. None means no button at all. */
export function addableRecordTypes(writable: readonly HealthSection[]): RecordType[] {
  return RECORD_TYPES.filter((type) => sectionOpen(RECORD_TYPE_SECTION[type], writable))
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

/**
 * Where a save leads, with its confirmation (`?saved=`) and — for the
 * notice's «Открыть запись» — the record it saved (`&record=`): after a save
 * the site returns to the section or the page the form was opened from
 * (implementation-handoff, «Поведение»; MW-09), and the record is one click
 * away in the notice.
 */
export function withSaved(href: string, saved: string, recordId: string | null = null): string {
  const joiner = href.includes('?') ? '&' : '?'
  return `${href}${joiner}saved=${saved}${recordId ? `&record=${recordId}` : ''}`
}

/** `?record=` of a page after a save, read strictly: a record id or nothing. */
export function parseSavedRecord(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && UuidSchema.safeParse(value).success ? value : null
}

/** `?saved=` of the record page (`/pets/[id]`) and of «Все сроки» after «Сделано» or «Состоялся» pressed there. */
export function parseRecordStepSaved(value: string | string[] | undefined): 'completed' | 'held' | null {
  return value === 'completed' || value === 'held' ? value : null
}

/**
 * Where a saved plan leads: back where the form was opened, the visit in the
 * notice (MW-09). «Изменить» and «Состоялся» on the visit's own page return
 * to it; the plan became the visit itself.
 */
export function visitPlanDoneHref(petId: string, kind: 'edit' | 'held', from: CompleteFrom, visitId: string, saved: 'added' | 'changed' | 'held'): string {
  // «Все сроки» says it in the visit's words, «Визит отмечен состоявшимся», not «Сделано».
  if (kind === 'held' && from === 'due') return withSaved(medicalRecordHref.due(petId), 'held', visitId)
  if (kind === 'held' && from === 'section') return withSaved(medicalRecordHref.section(petId, 'visits'), 'held', visitId)
  if (kind === 'held' && from === 'medical') return withSaved(medicalRecordHref.record(petId), 'held', visitId)
  return withSaved(medicalRecordHref.recordView(petId, visitId), saved)
}
