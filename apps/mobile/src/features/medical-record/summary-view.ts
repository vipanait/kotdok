import type { VetSummary } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import { dayInput, localToday } from '@/lib/calendar-day'
import { headerFacts, importantFacts } from './overview'

/**
 * «Для врача» (spec §7.17, §7.18) as text: the screen and the PDF both draw
 * this, so what the vet reads on the phone and on paper is the same. Tables
 * are rows of cells, already in words — overdue says «Просрочено», an empty
 * field says «Не указано владельцем», never «нет».
 */
export type SummaryView = {
  title: string
  petName: string
  pet: { lines: string[] }
  important: { label: string; value: string }[]
  vaccinations: string[][]
  parasites: string[][]
  visits: string[][]
  /** Newest first: day, value. */
  weights: string[][]
  /** Oldest first, for the chart. */
  chart: { day: string; kg: number; label: string }[]
  checks: string[][]
  footer: string
}

/** An empty cell: not a word, the same in every language. */
const NONE = '—'

export function summaryView(t: Dictionary, summary: VetSummary, today: string = localToday()): SummaryView {
  const words = t.vetSummary
  const day = (value: string) => t.day(value, value.slice(0, 4) !== today.slice(0, 4))
  const next = (value: string | null) => (value === null ? NONE : value < today ? words.overdueSince(day(value)) : day(value))
  const { pet } = summary

  const facts = headerFacts(t, { pet, weights: [], events: [], medications: [], writable: [] }, today)
  const latest = summary.weights[0]
  const weight =
    latest && latest.measured_on
      ? words.weightOn(t.medicalRecord.weight(latest.weight_kg), day(latest.measured_on))
      : pet.weight_kg !== null
        ? words.weightFromForm(t.medicalRecord.weight(pet.weight_kg))
        : `${words.weight}: ${words.notStated}`

  // «Важно знать» lists only what is on file; here every line stays, empty or not.
  const onFile = new Map(importantFacts(t, pet).map((fact) => [fact.label, fact.value]))
  const courses = summary.medications.map((course) => (course.dosage ? `${course.name} — ${course.dosage}` : course.name)).join('; ')
  const important = [
    { label: t.medicalRecord.allergies, value: onFile.get(t.medicalRecord.allergies) },
    { label: t.medicalRecord.chronic, value: onFile.get(t.medicalRecord.chronic) },
    { label: t.medicalRecord.takingNow, value: summary.medications.length > 0 ? courses : onFile.get(t.medicalRecord.takingNow) },
  ].map((fact) => ({ label: fact.label, value: fact.value || words.notStated }))

  const targetName = (code: string) => (t.medicalRecord.targets as Record<string, string>)[code] ?? code

  return {
    title: words.pdfTitle(pet.name),
    petName: pet.name,
    pet: { lines: [facts.meta, ...(facts.neutered ? [facts.neutered] : []), weight] },
    important,
    vaccinations: summary.vaccinations.map((row) => [
      targetName(row.target),
      row.last_done ? day(row.last_done) : words.noRecord,
      row.product ?? NONE,
      next(row.next),
    ]),
    parasites: summary.parasites.map((row) => [
      words.parasiteGroups[row.group],
      row.last_done ? day(row.last_done) : words.noRecord,
      row.product ?? NONE,
      next(row.next),
    ]),
    visits: summary.visits.map((visit) => [
      day(visit.date),
      visit.visit_kind ? t.medicalRecord.visits.kindsShort[visit.visit_kind] : NONE,
      visit.diagnosis ?? visit.reason ?? NONE,
      visit.items.length > 0
        ? visit.items.map((item) => (item.instructions ? `${item.name} — ${item.instructions}` : (item.name ?? ''))).join('; ')
        : NONE,
    ]),
    weights: summary.weights.flatMap((w) => (w.measured_on ? [[day(w.measured_on), t.medicalRecord.weight(w.weight_kg)]] : [])),
    chart: summary.weights
      .flatMap((w) => (w.measured_on ? [{ day: w.measured_on, kg: w.weight_kg, label: t.medicalRecord.weight(w.weight_kg) }] : []))
      .reverse(),
    checks: summary.checks.map((check) => [
      day(localToday(new Date(check.created_at))),
      t.urgency[check.urgency].label,
      check.summary,
    ]),
    footer: words.footer(t.day(today, true)),
  }
}

/**
 * «Мурка — медкарта — 24.09.2026.pdf». Characters a file system or a share
 * target refuses go, and so does any path; a name with nothing left is
 * «Питомец».
 */
export function summaryFileName(t: Dictionary, name: string, today: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '')
    // Direction and zero-width marks: a name must read as what it is.
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  // By code points, so an emoji is never cut in half.
  const safe = Array.from(cleaned).slice(0, 60).join('').replace(/[.\s]+$/g, '')
  return `${t.vetSummary.fileName(safe || t.vetSummary.pet, dayInput(today))}.pdf`
}
