import type { HealthOverview } from '@lapka/contracts'
import { headAge, isTakenNow } from '@lapka/shared'
import type { Dictionary } from '@/i18n'
import { duePhrase, dueItems, dueStatus } from './due'
import { speciesWord } from './overview'

/** How far ahead the memo looks: a stay with relatives is usually a week or two. */
const DAYS_AHEAD = 14

/**
 * The memo for whoever minds the pet (FB-3/02): plain text for Telegram or
 * a note — who it is, food, allergies, illnesses, the medicines given now,
 * notes, the clinic, and what is due in the next two weeks, overdue first.
 * A section with nothing in it is left out. Symptom checks are not the
 * sitter's business and never reach this function.
 */
export function sitterMemo(t: Dictionary, overview: HealthOverview, today: string): string {
  const words = t.sitterMemo
  const { pet } = overview
  const sections: string[] = []

  const age = headAge(pet, today)
  const head = [speciesWord(t, pet).toLowerCase(), pet.breed?.trim() || null, age === null ? null : t.petAge(age)]
  sections.push(`${pet.name} — ${head.filter(Boolean).join(', ')}`)

  if (pet.diet) sections.push(words.diet(t.diet[pet.diet]))
  // «; » between items: an allergy may have a comma of its own.
  if (pet.allergies.length > 0) sections.push(words.allergies(pet.allergies.join('; ')))
  if (pet.chronic_conditions.length > 0) sections.push(words.chronic(pet.chronic_conditions.join('; ')))

  const courses = overview.medications.filter((course) => isTakenNow(course, today))
  if (courses.length > 0) {
    const lines = courses.map((course) => `— ${course.name}${course.dosage ? `, ${course.dosage}` : ''}`)
    sections.push([words.medicines, ...lines].join('\n'))
  }

  if (pet.notes?.trim()) sections.push(words.notes(pet.notes.trim()))

  const clinic = lastClinic(overview, today)
  if (clinic) sections.push(words.clinic(clinic))

  const horizon = addDays(today, DAYS_AHEAD)
  const plans = dueItems(overview.events)
    .filter((due) => due.date <= horizon)
    .map((due) => {
      const what = duePhrase(t, { kind: due.kind, name: due.item.name, targets: due.item.targets }).text
      const status = dueStatus(t, due.date, today)
      const place = overview.events.find((event) => event.id === due.eventId)?.clinic
      const when = status.tone === 'overdue' ? words.overdueSince(status.day) : status.day
      return `— ${when}: ${what}${place ? `, ${place}` : ''}`
    })
  if (plans.length > 0) sections.push([words.plans, ...plans].join('\n'))

  sections.push(words.footer)
  return sections.join('\n\n')
}

/** The clinic of the latest visit that happened, if it was written down. */
function lastClinic(overview: HealthOverview, today: string): string | null {
  const visits = overview.events
    .filter((event) => event.kind === 'visit' && event.status === 'done' && event.date <= today && event.clinic)
    .sort((a, b) => b.date.localeCompare(a.date))
  return visits[0]?.clinic ?? null
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}
