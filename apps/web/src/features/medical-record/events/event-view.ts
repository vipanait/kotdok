import type { HealthEvent, HealthOverview, HealthSection } from '@lapka/contracts'
import { coreVaccinations, doneEvents, nextDayOf, parasiteCovers, parasiteGroups, plannedEvents, type DueTone, type ParasiteCover } from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { MEDICAL_RECORD_STAGE, completeOpen, medicalRecordHref, sectionOpen, type MedicalRecordStage } from '../stage'
import { dueStatusText, eventItemName, formatDay, recordDay } from '../view-model'
import type { EventFormKind } from './event-form'

/**
 * The vaccinations page (web v1 «vaccines», «vaccines-empty») and one saved
 * record («record», «planned»), worked out from the overview. No React, so
 * the rules are unit tested: plans soonest first and done records newest
 * first; the core vaccinations of the pet's species from the records alone —
 * the form's «привит» is shown as what the form says, never as a
 * vaccination with a date; a done record offers no change, only deletion.
 */

type Words = Dictionary['medicalRecord']

function targetName(words: Words, code: string): string {
  return (words.targets as Record<string, string>)[code] ?? (words.parasiteTargets as Record<string, string>)[code] ?? code
}

/** «Панлейкопения, калицивироз, ринотрахеит». */
export function targetsText(words: Words, targets: readonly string[]): string {
  return targets.map((code, index) => (index === 0 ? targetName(words, code) : targetName(words, code).toLowerCase())).join(', ')
}

export type EventCard = {
  id: string
  href: string
  /** «12 марта 2026»: a record's day always with its year. */
  day: string
  items: string[]
  clinic: string | null
  /** A plan that is close or overdue says so in words; a far one only has its day. */
  due: { text: string; tone: DueTone } | null
  /** Everything the card says, for the link's accessible name. */
  label: string
}

export type CoreRow = { target: string; title: string; text: string }

/** A parasite card beside the treatments (web v1 «parasites»): the last one, the next one and its «Сделано». */
export type CoverCard = {
  cover: ParasiteCover
  title: string
  /** «Последняя — 20 июня», or that none is recorded. */
  last: string
  product: string | null
  next: { text: string; tone: DueTone | 'none' }
  /** «Сделано» for the next plan's item; null without a plan or where it is not offered. */
  completeHref: string | null
  completeLabel: string | null
}

export type EventsPageView = {
  subtitle: string
  planned: EventCard[]
  done: EventCard[]
  /** Nothing recorded: what the form says, without a date it never had. */
  empty: { title: string; body: string } | null
  /** Vaccinations only: the species' core vaccinations. */
  core: { title: string; rows: CoreRow[]; note: string } | null
  /** Treatments only: fleas and ticks, and worms. */
  covers: CoverCard[] | null
}

function card(dict: Dictionary, locale: Locale, petId: string, event: HealthEvent, today: string): EventCard {
  const words = dict.medicalRecord
  const kind = event.kind
  const day = formatDay(words, event.date, true)
  const items = event.items.map((item) => {
    const name = eventItemName(dict, kind, item)
    // «Бравекто Спот-он · блохи, клещи»: a named treatment says what it covered.
    if (kind !== 'parasite' || !item.name) return name
    const groups = parasiteGroups(item.targets).map((group) => words.parasiteGroups[group].toLowerCase())
    return groups.length > 0 ? `${name} · ${groups.join(', ')}` : name
  })
  const status = event.status === 'planned' ? dueStatusText(dict, locale, event.date, today) : null
  const due = status && status.tone !== 'later' ? status : null
  return {
    id: event.id,
    href: medicalRecordHref.recordView(petId, event.id),
    day,
    items,
    clinic: event.clinic,
    due,
    label: [day, due?.text, items.join(', '), event.clinic].filter(Boolean).join('. '),
  }
}

export function eventsPage(
  dict: Dictionary,
  locale: Locale,
  kind: EventFormKind,
  overview: HealthOverview,
  today: string,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
): EventsPageView {
  const words = dict.medicalRecord
  const page = words.eventsPage[kind]
  const { pet } = overview
  const petId = pet.id
  const planned = [...plannedEvents(overview.events, kind)].sort((a, b) => a.date.localeCompare(b.date))
  const done = [...doneEvents(overview.events, kind)].sort((a, b) => b.date.localeCompare(a.date))

  let empty: EventsPageView['empty'] = null
  if (planned.length === 0 && done.length === 0) {
    if (kind === 'vaccination' && pet.vaccinated === true) empty = { title: page.legacyTitle, body: page.legacyYes }
    else if (kind === 'vaccination' && pet.vaccinated === false) empty = { title: page.emptyTitle, body: page.legacyNo }
    else empty = { title: page.emptyTitle, body: page.emptyBody }
  }

  const coreWords = words.eventsPage.core
  const core =
    kind === 'vaccination'
      ? {
          title: coreWords.title,
          note: coreWords.note[pet.species],
          rows: coreVaccinations(pet.species, overview.events).map(({ target, next, last }) => ({
            target,
            title: targetName(words, target),
            text: next
              ? coreWords.next.replace('{day}', recordDay(words, next, today))
              : last
                ? coreWords.last.replace('{day}', formatDay(words, last, true))
                : coreWords.none,
          })),
        }
      : null

  const coverWords = words.eventsPage.covers
  const covers =
    kind === 'parasite'
      ? parasiteCovers(overview.events).map(({ cover, last, next }): CoverCard => {
          const title = coverWords.titles[cover]
          const status = next ? dueStatusText(dict, locale, next.event.date, today) : null
          const offered = next !== null && completeOpen('parasite', stage) && sectionOpen('parasites', overview.writable, stage)
          return {
            cover,
            title,
            last: last ? coverWords.last.replace('{day}', recordDay(words, last.event.date, today)) : coverWords.noLast,
            product: last?.item.name ?? null,
            next: status
              ? status.tone === 'later'
                ? { text: coverWords.next.replace('{day}', status.text), tone: 'later' }
                : status
              : { text: coverWords.noNext, tone: 'none' },
            completeHref: offered && next ? medicalRecordHref.complete(petId, next.event.id, next.item.id, 'section') : null,
            completeLabel:
              offered && status ? coverWords.markDoneLabel.replace('{title}', title).replace('{status}', status.text.toLowerCase()) : null,
          }
        })
      : null

  const subtitle = words.eventsPage.subtitle[kind]
    .replace('{name}', pet.name)
    .replace('{animal}', words.animal[pet.species][pet.sex ?? 'unknown'])
  return {
    subtitle,
    planned: planned.map((event) => card(dict, locale, petId, event, today)),
    done: done.map((event) => card(dict, locale, petId, event, today)),
    empty,
    core,
    covers,
  }
}

// ---------- One record ----------

export type RecordItemView = { key: string; name: string; targets: string | null; next: string | null }

export type EventRecordView = {
  kind: EventFormKind
  title: string
  status: HealthEvent['status']
  badge: string
  day: string
  due: { text: string; tone: DueTone } | null
  clinic: string | null
  notes: string | null
  items: RecordItemView[]
  /** What the actions card says: a done record is read-only. */
  actionsBody: string
  /** Only a plan is changed (owner rule of 26 September 2026), and only where the server stores the kind. */
  editHref: string | null
  /**
   * «Сделано» on a plan: one item. A plan of several opens the question
   * «which one was done»; the others stay planned.
   */
  completeHref: string | null
  /** Deleting or cancelling is offered where the server stores the kind. */
  removable: boolean
  sectionHref: string
  /** The delete or cancel question names the record. */
  removeTitle: string
}

export function eventRecord(
  dict: Dictionary,
  locale: Locale,
  petId: string,
  event: HealthEvent,
  events: readonly HealthEvent[],
  today: string,
  writable: readonly HealthSection[] | null = null,
  stage: MedicalRecordStage = MEDICAL_RECORD_STAGE,
): EventRecordView {
  if (event.kind === 'visit') throw new Error('a visit has its own page')
  const words = dict.medicalRecord
  const view = words.eventRecord
  const kind = event.kind
  const planned = event.status === 'planned'
  const day = formatDay(words, event.date, true)
  const status = planned ? dueStatusText(dict, locale, event.date, today) : null
  const kindWord = words.recordKinds[kind]
  const section = kind === 'vaccination' ? 'vaccinations' : 'parasites'
  // The server's word on what it stores: an older server gets no action that would fail.
  const writes = sectionOpen(section, writable, stage)
  return {
    kind,
    title: kindWord,
    status: event.status,
    badge: planned ? view.plannedBadge : view.doneBadge,
    day,
    due: status && status.tone !== 'later' ? status : null,
    clinic: event.clinic,
    notes: event.notes,
    items: event.items.map((item) => {
      const next = planned ? null : nextDayOf(item.id, events)
      return {
        key: item.id,
        name: item.name ?? words.due.noProduct,
        targets: item.targets.length > 0 ? targetsText(words, item.targets) : null,
        next: next ? view.next.replace('{day}', formatDay(words, next, true)) : null,
      }
    }),
    actionsBody: planned ? view.plannedBody : view.doneBody,
    editHref: planned && writes ? medicalRecordHref.recordEdit(petId, event.id) : null,
    completeHref:
      planned && writes && completeOpen(kind, stage)
        ? medicalRecordHref.complete(petId, event.id, event.items.length === 1 ? event.items[0].id : null)
        : null,
    removable: writes,
    sectionHref: medicalRecordHref.section(petId, section),
    removeTitle: (planned ? view.cancelTitle : view.deleteTitle).replace('{kind}', kindWord.toLowerCase()).replace('{day}', day),
  }
}

/** `?saved=` on a section page after a save or a delete: a one-time confirmation. */
export const EVENT_SAVED = ['added', 'changed', 'deleted', 'cancelled', 'completed'] as const
export type EventSaved = (typeof EVENT_SAVED)[number]

export function parseEventSaved(value: string | string[] | undefined): EventSaved | null {
  return typeof value === 'string' && (EVENT_SAVED as readonly string[]).includes(value) ? (value as EventSaved) : null
}
