import type { HealthOverview } from '@lapka/contracts'
import { ageText } from '@/features/pets/pet-age'
import type { Dictionary } from '@/i18n'
import { duePhrase, dueItems, dueStatus, visitPhrase } from './due'
import { speciesWord } from './overview'
import { givenOn } from './reminders/doses'

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

  const head = [speciesWord(t, pet).toLowerCase(), pet.breed?.trim() || null, ageText(t, pet, today)]
  sections.push(`${pet.name} — ${head.filter(Boolean).join(', ')}`)

  if (pet.diet) sections.push(words.diet(t.diet[pet.diet]))
  // «; » between items: an allergy may have a comma of its own.
  const allergies = filled(pet.allergies)
  if (allergies.length > 0) sections.push(words.allergies(allergies.join('; ')))
  const chronic = filled(pet.chronic_conditions)
  if (chronic.length > 0) sections.push(words.chronic(chronic.join('; ')))

  // The courses being given now; with no courses at all, the form's list, as
  // «Важно знать» shows it — a missing medicine is the worst gap here.
  const medicines =
    overview.medications.length > 0
      ? overview.medications
          // Given today, its last day included, as «Сегодня» counts it; with the
          // times the owner set — exactly what a sitter needs (PR #82 review).
          .filter((course) => givenOn(course, today))
          .map(
            (course) =>
              `${course.name}${course.dosage ? `, ${course.dosage}` : ''}${course.reminder_times.length > 0 ? ` (${course.reminder_times.join(', ')})` : ''}`,
          )
      : filled(pet.medications)
  if (medicines.length > 0) sections.push([words.medicines, ...medicines.map((line) => `— ${line}`)].join('\n'))

  if (pet.notes?.trim()) sections.push(words.notes(pet.notes.trim()))

  const clinic = lastClinic(overview, today)
  if (clinic) sections.push(words.clinic(clinic))

  const horizon = addDays(today, DAYS_AHEAD)
  const plans = dueItems(overview.events)
    .map((due) => ({ due, status: dueStatus(t, due.date, today) }))
    // Overdue for months (`dated`) is the owner's to sort out, not the sitter's.
    .filter(({ due, status }) => due.date <= horizon && !status.dated)
    .map(({ due, status }) => {
      const visit = due.kind === 'visit' ? overview.events.find((event) => event.id === due.eventId) : undefined
      const what = visit
        ? visitPhrase(t, visit.visit_kind)
        : duePhrase(t, { kind: due.kind, name: due.item.name, targets: due.item.targets }).text
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

function filled(items: readonly string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item !== '')
}
