import type { HealthEvent } from '@lapka/contracts'
import { calendarLink } from '@lapka/shared'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/**
 * «Добавить в Google Календарь» on a planned visit (FB-3/01, design
 * `visit`): the link that opens Google Calendar with the event filled in —
 * the pet, the visit and its kind, the day, the clinic, the visit's reason
 * and note. Nothing else of the medical record goes into the address. Only
 * for a plan on today or ahead; the owner saves the event in Google, and the
 * site never says it was added.
 */
export function visitCalendarHref(dict: Dictionary, petName: string, visit: HealthEvent, today: string): string | null {
  if (visit.kind !== 'visit' || visit.status !== 'planned' || visit.date < today) return null
  const words = dict.medicalRecord.visitRecord
  const kind = visit.visit_kind && visit.visit_kind !== 'other' ? dict.medicalRecord.visits.kinds[visit.visit_kind].toLocaleLowerCase() : null
  const title = (kind ? words.calendarEventKind : words.calendarEvent)
    .replace('{name}', () => petName)
    .replace('{what}', words.calendarWhat)
    .replace('{kind}', () => kind ?? '')
  const details = [visit.reason?.trim() || null, visit.notes?.trim() || null].filter(Boolean).join('\n\n') || null
  return calendarLink({ title, date: visit.date, details, location: visit.clinic?.trim() || null })
}
