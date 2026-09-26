import type { HealthEvent, Medication, VetSummary } from '@lapka/contracts'
import { datedWeights, localToday, type DatedWeight } from './record-overview'

/**
 * «Для врача» (spec §7.17, §7.18) without words: what each part of the
 * summary says, the same on the phone, on the site and on paper. Each app
 * puts it into its own language and layout; the rules stay here. Nothing the
 * owner left empty is ever read as an absence — «не указано», never «нет».
 */

type Dated = { last_done: string | null; next: string | null }

/** A planned date as the summary gives it: overdue once its day has passed (a plan for today is not late yet). */
export type SummaryNext = { day: string; overdue: boolean }

export function summaryNext(next: string | null, today: string): SummaryNext | null {
  return next === null ? null : { day: next, overdue: next < today }
}

/**
 * Whether a table of the summary holds anything the owner recorded — a shot,
 * a treatment or a plan. With nothing, the table is not drawn as rows of
 * blanks: the section says what the form says, or that nothing was said.
 */
export function summaryRowsRecorded(rows: readonly Dated[]): boolean {
  return rows.some((row) => row.last_done !== null || row.next !== null)
}

/** «Принимает сейчас» in the summary. */
export type SummaryTaking =
  /** Courses being given now (`isTakenNow`), as the server chose them, with their dosage. */
  | { from: 'courses'; courses: Medication[] }
  /** No course is being given: the pet form's own list, for a pet the courses never reached. */
  | { from: 'form'; names: string[] }
  | { from: 'none' }

export function summaryTaking(summary: Pick<VetSummary, 'medications' | 'pet'>): SummaryTaking {
  if (summary.medications.length > 0) return { from: 'courses', courses: summary.medications }
  // The server keeps the form's list equal to the courses once there are any.
  const names = summary.pet.medications.map((name) => name.trim()).filter((name) => name !== '')
  return names.length > 0 ? { from: 'form', names } : { from: 'none' }
}

/** The pet's weight line: the latest weighing with its day, the form's weight without one, or nothing said. */
export type SummaryPetWeight =
  | { from: 'measured'; kg: number; day: string }
  | { from: 'form'; kg: number }
  | { from: 'none' }

export function summaryPetWeight(summary: Pick<VetSummary, 'weights' | 'pet'>): SummaryPetWeight {
  const dated = datedWeights(summary.weights)
  const latest = dated[dated.length - 1]
  if (latest) return { from: 'measured', kg: latest.weight_kg, day: latest.measured_on }
  return summary.pet.weight_kg !== null ? { from: 'form', kg: summary.pet.weight_kg } : { from: 'none' }
}

/** The weighings of the summary: newest first for the list, oldest first for the chart. Dated only. */
export function summaryWeights(summary: Pick<VetSummary, 'weights'>): { latestFirst: DatedWeight[]; chart: DatedWeight[] } {
  const chart = datedWeights(summary.weights)
  return { latestFirst: [...chart].reverse(), chart }
}

export type SummaryPrescription = { name: string; instructions: string | null }

export type SummaryVisit = {
  visit: HealthEvent
  /** What the visit found: the diagnosis, else the reason; null when neither was written. */
  finding: string | null
  /** What was prescribed, by name; a prescription without a name says nothing and is left out. */
  prescriptions: SummaryPrescription[]
}

export function summaryVisit(visit: HealthEvent): SummaryVisit {
  const text = (value: string | null) => (value && value.trim() !== '' ? value.trim() : null)
  return {
    visit,
    finding: text(visit.diagnosis) ?? text(visit.reason),
    prescriptions: visit.items.flatMap((item) => {
      const name = text(item.name)
      return name ? [{ name, instructions: text(item.instructions) }] : []
    }),
  }
}

/** A check's day on the owner's clock — the zone of the device reading it, as everywhere else in the record. */
export function summaryCheckDay(createdAt: string): string {
  return localToday(new Date(createdAt))
}

/**
 * The pet's name as the stem of a file name («Мурка — медкарта — 24.09.2026»):
 * characters a file system or a share target refuses go, and so does any
 * path, direction or zero-width mark; at most `max` characters, never half
 * an emoji. '' when nothing is left — the app names it «Питомец».
 */
export function fileNameStem(name: string, max = 60): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '')
    // Direction and zero-width marks: a name must read as what it is.
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  // By code points, so an emoji is never cut in half.
  return Array.from(cleaned).slice(0, max).join('').replace(/[.\s]+$/g, '')
}

/**
 * Text as a CSS string, for the page footers of the printed summary:
 * quotes, backslashes, line breaks and «<» cannot end it or the style block.
 */
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]/g, ' ').replace(/</g, '\\3C ')}"`
}
