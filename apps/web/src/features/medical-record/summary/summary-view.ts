import type { Medication, VetSummary } from '@lapka/contracts'
import {
  fileNameStem,
  summaryCheckDay,
  summaryNext,
  summaryPetWeight,
  summaryRowsRecorded,
  summaryTaking,
  summaryVisit,
  summaryWeights,
} from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { formatDay, formatDecimal, formatRange, formatWeight, recordDay, type WeightPoint } from '../view-model'

/**
 * «Для врача» (spec §7.17, §7.18; web v1 «summary», «dog-summary», «print»)
 * in the site's words, from the summary the API returned. One page for the
 * screen and for paper: the print style only takes the frame away.
 *
 * The rules are shared with the phone (packages/shared, vet-summary.ts):
 * which courses are taken now, when a date is overdue, what a visit found.
 * Here they become text. Nothing the owner left empty is said to be absent:
 * an empty part is «Не указано владельцем» or what the pet form says.
 */

export type SummaryCell = { label: string; text: string }
export type SummaryRow = { key: string; cells: SummaryCell[] }
export type SummaryTable = { columns: string[]; rows: SummaryRow[] }

/** A section is a table, a list of facts or one honest sentence. */
export type SummaryPart = { kind: 'table'; table: SummaryTable } | { kind: 'note'; text: string }

export type SummaryWeight =
  | {
      kind: 'measured'
      /** Two or more weighings: the chart, oldest first. */
      chart: WeightPoint[] | null
      chartLabel: string
      latest: string
      earlier: string | null
    }
  | { kind: 'note'; text: string }

export type SummaryCheck = { key: string; day: string; urgency: VetSummary['checks'][number]['urgency']; text: string }

export type VetSummaryPage = {
  title: string
  /** «Мурка · Сведения владельца». */
  subtitle: string
  /** The printed heading, «Медкарта: Мурка». */
  printTitle: string
  /** The document's title while it prints: the name «Сохранить как PDF» offers. */
  fileTitle: string
  pet: { name: string; meta: string; weight: string }
  /** Every line said, empty or not — or one «Не указано владельцем» when all three are empty. */
  important: { kind: 'facts'; facts: SummaryCell[] } | { kind: 'note'; text: string }
  vaccinations: SummaryPart
  parasites: SummaryPart
  visits: SummaryPart
  weight: SummaryWeight
  checks: SummaryCheck[] | { note: string }
  footer: string
}

/** «12.03.2026»: tables give the full date, as the printed A4 of the design. */
export function numericDay(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

const NONE = '—'

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template)
}

/** «Лечебный корм · по схеме врача, постоянно с 2 августа». */
function courseText(dict: Dictionary, course: Medication, today: string): string {
  const words = dict.medicalRecord.vetSummary
  const record = dict.medicalRecord
  const since = course.started_on ? fill(words.courseSince, { day: recordDay(record, course.started_on, today) }) : null
  const period = course.ongoing
    ? [words.courseOngoing, since].filter(Boolean).join(' ')
    : course.started_on && course.ended_on
      ? formatRange(record, course.started_on, course.ended_on, today)
      : course.ended_on
        ? fill(words.courseUntil, { day: recordDay(record, course.ended_on, today) })
        : since
  const details = [course.dosage?.trim() || null, period].filter(Boolean).join(', ')
  return details ? `${course.name} · ${details}` : course.name
}

function nextText(dict: Dictionary, next: string | null, today: string): string {
  const due = summaryNext(next, today)
  if (!due) return NONE
  return due.overdue ? fill(dict.medicalRecord.vetSummary.overdue, { day: numericDay(due.day) }) : numericDay(due.day)
}

function cells(columns: readonly string[], texts: string[]): SummaryCell[] {
  return texts.map((text, index) => ({ label: columns[index] ?? '', text }))
}

export function vetSummaryPage(dict: Dictionary, locale: Locale, summary: VetSummary, today: string): VetSummaryPage {
  const record = dict.medicalRecord
  const words = record.vetSummary
  const { pet } = summary
  const notStated = words.notStated

  // ---------- The pet ----------
  const meta = [record.animal[pet.species].unknown]
  if (pet.breed?.trim()) meta.push(pet.breed.trim())
  // An age of 0 is an unfilled field, not a newborn (as in the record's head).
  if (pet.age_years != null && pet.age_years > 0) meta.push(formatCount(dict.pets.age, pet.age_years, locale))
  if (pet.sex === 'female' || pet.sex === 'male') meta.push(words.sex[pet.sex])
  if (pet.neutered === true) meta.push(record.neutered[pet.sex ?? 'unknown'])

  const petWeight = summaryPetWeight(summary)
  const weightValue =
    petWeight.from === 'measured'
      ? fill(words.weightMeasured, { weight: formatWeight(record, petWeight.kg), day: formatDay(record, petWeight.day, true) })
      : petWeight.from === 'form'
        ? fill(words.weightFromForm, { weight: formatWeight(record, petWeight.kg) })
        : notStated.toLowerCase()

  // ---------- Important ----------
  const taking = summaryTaking(summary)
  const takingText =
    taking.from === 'courses'
      ? taking.courses.map((course) => courseText(dict, course, today)).join('; ')
      : taking.from === 'form'
        ? taking.names.join(', ')
        : ''
  const facts = [
    { label: record.important.allergies, text: pet.allergies.join(', ') },
    { label: record.important.chronic, text: pet.chronic_conditions.join(', ') },
    { label: record.important.takingNow, text: takingText },
  ]
  const important: VetSummaryPage['important'] = facts.every((fact) => fact.text.trim() === '')
    ? { kind: 'note', text: notStated }
    : { kind: 'facts', facts: facts.map((fact) => ({ label: fact.label, text: fact.text.trim() || notStated })) }

  // ---------- Vaccinations and treatments ----------
  const targetName = (code: string) => (record.targets as Record<string, string>)[code] ?? code
  const vaccinations: SummaryPart = summaryRowsRecorded(summary.vaccinations)
    ? {
        kind: 'table',
        table: {
          columns: words.vaccinationColumns,
          rows: summary.vaccinations.map((row) => ({
            key: row.target,
            cells: cells(words.vaccinationColumns, [
              targetName(row.target),
              row.last_done ? numericDay(row.last_done) : words.noRecord,
              row.product ?? NONE,
              nextText(dict, row.next, today),
            ]),
          })),
        },
      }
    : {
        kind: 'note',
        text: pet.vaccinated === true ? words.vaccinatedInForm : pet.vaccinated === false ? words.notVaccinatedInForm : notStated,
      }

  const parasites: SummaryPart = summaryRowsRecorded(summary.parasites)
    ? {
        kind: 'table',
        table: {
          columns: words.parasiteColumns,
          rows: summary.parasites.map((row) => ({
            key: row.group,
            cells: cells(words.parasiteColumns, [
              words.parasiteRows[row.group],
              row.last_done ? numericDay(row.last_done) : words.noRecord,
              row.product ?? NONE,
              nextText(dict, row.next, today),
            ]),
          })),
        },
      }
    : { kind: 'note', text: notStated }

  // ---------- Visits ----------
  const visits: SummaryPart =
    summary.visits.length > 0
      ? {
          kind: 'table',
          table: {
            columns: words.visitColumns,
            rows: summary.visits.map(summaryVisit).map(({ visit, finding, prescriptions }) => ({
              key: visit.id,
              cells: cells(words.visitColumns, [
                [numericDay(visit.date), visit.visit_kind ? record.visits.kinds[visit.visit_kind] : null, visit.clinic?.trim() || null]
                  .filter(Boolean)
                  .join(' · '),
                finding ?? NONE,
                prescriptions.length > 0
                  ? prescriptions.map((item) => (item.instructions ? `${item.name} — ${item.instructions}` : item.name)).join('; ')
                  : NONE,
              ]),
            })),
          },
        }
      : { kind: 'note', text: notStated }

  // ---------- Weight ----------
  const { latestFirst, chart } = summaryWeights(summary)
  const entry = (point: { measured_on: string; weight_kg: number }) =>
    fill(words.weightEntry, { day: recordDay(record, point.measured_on, today), weight: formatWeight(record, point.weight_kg) })
  const weight: SummaryWeight =
    latestFirst.length > 0
      ? {
          kind: 'measured',
          chart:
            chart.length >= 2
              ? chart.map((point) => ({
                  key: point.id,
                  day: point.measured_on,
                  value: point.weight_kg,
                  label: formatWeight(record, point.weight_kg),
                  dayLabel: recordDay(record, point.measured_on, today),
                }))
              : null,
          chartLabel: fill(record.weightCard.chartLabel, {
            from: formatDecimal(record, chart[0].weight_kg),
            to: formatDecimal(record, chart[chart.length - 1].weight_kg),
          }),
          latest: entry(latestFirst[0]),
          earlier: latestFirst.length > 1 ? latestFirst.slice(1).map(entry).join(' · ') : null,
        }
      : {
          kind: 'note',
          text: pet.weight_kg !== null ? fill(words.weightFormOnly, { weight: formatWeight(record, pet.weight_kg) }) : notStated,
        }

  // ---------- Checks ----------
  const checks: VetSummaryPage['checks'] =
    summary.checks.length > 0
      ? summary.checks.map((check) => ({
          key: check.id,
          day: formatDay(record, summaryCheckDay(check.created_at), true),
          urgency: check.urgency,
          text: check.summary,
        }))
      : { note: words.noChecks }

  const name = pet.name
  return {
    title: words.title,
    subtitle: fill(words.subtitle, { name }),
    printTitle: fill(words.printTitle, { name }),
    fileTitle: fill(words.fileName, { name: fileNameStem(name) || words.unnamed, day: numericDay(today) }),
    pet: { name, meta: meta.join(' · '), weight: fill(words.weightLine, { weight: weightValue }) },
    important,
    vaccinations,
    parasites,
    visits,
    weight,
    checks,
    footer: fill(words.footer, { day: formatDay(record, today, true) }),
  }
}
