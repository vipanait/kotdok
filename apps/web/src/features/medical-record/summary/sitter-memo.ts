import type { HealthOverview } from '@lapka/contracts'
import { dueEntries, dueTiming, givenOn, headAge } from '@lapka/shared'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import { dueLineTitle, recordDay } from '../view-model'

/**
 * «Памятка для передержки» (FB-3/02, design `memo`): what whoever minds the
 * pet needs — who it is, food, allergies and illnesses, the medicines given
 * now with the dosage and the times the owner set, notes, the clinic of the
 * last visit, and what is due in the next two weeks, overdue first. Read
 * from the saved record; a section with nothing in it is left out. Symptom
 * checks, and the reasons and diagnoses of visits, are not the sitter's
 * business: they never reach it. The phone's rules (apps/mobile sitter-memo.ts).
 */

/** How far ahead the memo looks: a stay with relatives is usually a week or two. */
export const MEMO_DAYS_AHEAD = 14

export type MemoSection = {
  key: 'diet' | 'particulars' | 'medicines' | 'plans' | 'clinic' | 'notes'
  title: string
  lines: string[]
}

export type SitterMemo = { name: string; meta: string; sections: MemoSection[] }

function filled(items: readonly string[]): string[] {
  return items.map((entry) => entry.trim()).filter((entry) => entry !== '')
}

export function sitterMemo(dict: Dictionary, locale: Locale, overview: HealthOverview, today: string): SitterMemo {
  const words = dict.medicalRecord.memo
  const { pet } = overview
  const sections: MemoSection[] = []

  const age = headAge(pet, today)
  const meta = [
    dict.medicalRecord.animal[pet.species][pet.sex ?? 'unknown'],
    pet.breed?.trim() || null,
    age === null ? null : formatCount(dict.pets.age, age, locale),
  ]
    .filter(Boolean)
    .join(' · ')

  if (pet.diet) {
    const diet = { dry: dict.pets.dietDry, wet: dict.pets.dietWet, mixed: dict.pets.dietMixed, raw: dict.pets.dietRaw }[pet.diet]
    sections.push({ key: 'diet', title: words.diet, lines: [diet] })
  }

  // «; » between items: an allergy may have a comma of its own.
  const allergies = filled(pet.allergies)
  const chronic = filled(pet.chronic_conditions)
  const particulars = [
    allergies.length > 0 ? `${words.allergies}: ${allergies.join('; ')}` : null,
    chronic.length > 0 ? `${words.chronic}: ${chronic.join('; ')}` : null,
  ].filter((line): line is string => line !== null)
  if (particulars.length > 0) sections.push({ key: 'particulars', title: words.particulars, lines: particulars })

  // The courses given today, the last day included, as «Сегодня» counts them;
  // with no courses at all, the form's list, as «Важно знать» shows it.
  const medicines =
    overview.medications.length > 0
      ? overview.medications
          .filter((course) => givenOn(course, today))
          .flatMap((course) => [
            course.dosage ? `${course.name} — ${course.dosage}` : course.name,
            ...(course.reminder_times.length > 0 ? [`${words.times}: ${course.reminder_times.join(', ')}`] : []),
          ])
      : filled(pet.medications)
  if (medicines.length > 0) sections.push({ key: 'medicines', title: words.medicines, lines: medicines })

  const horizon = addDays(today, MEMO_DAYS_AHEAD)
  const plans = dueEntries(overview.events)
    .filter((entry) => entry.date <= horizon && !dueTiming(entry.date, today).longOverdue)
    .map((entry) => {
      const title = dueLineTitle(dict, locale, {
        kind: entry.kind,
        name: entry.item?.name ?? null,
        targets: entry.item?.targets ?? [],
        visit_kind: entry.kind === 'visit' ? entry.event.visit_kind : null,
      })
      const day = recordDay(dict.medicalRecord, entry.date, today)
      if (entry.date < today) return words.overdue.replace('{title}', () => title).replace('{day}', day)
      const clinic = entry.event.clinic?.trim()
      return `${day} — ${title}${clinic ? `, ${clinic}` : ''}`
    })
  if (plans.length > 0) sections.push({ key: 'plans', title: words.plans, lines: plans })

  const clinic = overview.events
    .filter((entry) => entry.kind === 'visit' && entry.status === 'done' && entry.date <= today && entry.clinic?.trim())
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.clinic
  if (clinic) sections.push({ key: 'clinic', title: words.clinic, lines: [clinic.trim()] })

  if (pet.notes?.trim()) sections.push({ key: 'notes', title: words.notes, lines: [pet.notes.trim()] })

  return { name: pet.name, meta, sections }
}

/** The memo as plain text, to paste into a messenger or a note. */
export function memoText(dict: Dictionary, memo: SitterMemo): string {
  return [
    memo.meta ? `${memo.name} — ${memo.meta}` : memo.name,
    ...memo.sections.map((section) => [section.title, ...section.lines].join('\n')),
    dict.medicalRecord.memo.footer,
  ].join('\n\n')
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}
