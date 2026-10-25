/**
 * The follow-up loop on the site (docs/plans/followup-loop/README.md, FU-02,
 * FU-03, FU-07): what the screens show, worked out from the server's data.
 *
 * Nothing here decides an outcome. The decision of an answer, the next
 * question and the escalation come back from the server; this module only
 * picks words, dates and rows for them. When a question rings is the shared
 * `followupFireMoment`, on the clock of whoever runs it.
 */

import {
  FOLLOWUP_STATES,
  type CheckCaseLink,
  type FollowupCase,
  type FollowupCaseSummary,
  type FollowupDecision,
  type FollowupSource,
  type FollowupState,
  type PastEpisode,
  type SymptomCheckRecord,
  type Urgency,
} from '@lapka/contracts'
import { followupFireMoment } from '@lapka/shared'
import { intlLocale, type Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'

type Words = Dictionary['followup']

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Where a case lives on the site. */
export const followupHref = {
  timeline: (caseId: string) => `/checks/case/${caseId}`,
  /**
   * `answer` preselects a choice; nothing is saved until «Отметить». `from`
   * says where the owner came from, for the statistics of the first answer.
   */
  checkin: (caseId: string, options: { answer?: FollowupState; from?: CheckinFrom } = {}) => {
    const query = [options.answer ? `answer=${options.answer}` : null, options.from ? `from=${options.from}` : null].filter(Boolean)
    return `/checks/case/${caseId}/checkin${query.length ? `?${query.join('&')}` : ''}`
  },
  /** The symptom form with the case's context, for a paid re-check. */
  recheck: (petId: string, caseId: string) => `/check?pet=${petId}&case=${caseId}`,
}

/** Where a check-in page was opened from on the site. */
export const CHECKIN_FROM = ['banner', 'timeline', 'record'] as const
export type CheckinFrom = (typeof CHECKIN_FROM)[number]

const SOURCE_OF: Record<CheckinFrom, FollowupSource> = { banner: 'web_banner', timeline: 'timeline', record: 'pet_card' }

/** `?from=` of the check-in page as the API's `source`; a direct link counts as the timeline. */
export function checkinSource(value: string | string[] | undefined): FollowupSource {
  return typeof value === 'string' && (CHECKIN_FROM as readonly string[]).includes(value) ? SOURCE_OF[value as CheckinFrom] : 'timeline'
}

/** `?answer=` of the check-in page, read strictly. */
export function parseAnswer(value: string | string[] | undefined): FollowupState | null {
  return typeof value === 'string' && (FOLLOWUP_STATES as readonly string[]).includes(value) ? (value as FollowupState) : null
}

/** Which schedule sentence the reminder card says, by the check's urgency. */
export function offerSentence(words: Words, urgency: Urgency): string | null {
  switch (urgency) {
    case 'monitor':
      return words.offerWatch12
    case 'home_care':
      return words.offerWatch24
    case 'urgent':
    case 'emergency':
      return words.offerVet
    default:
      return null
  }
}

/**
 * Where the reminder card stands on a result: before the advice for a
 * «watch» level, after the visit action for one that sends to a vet.
 */
export function offerPlacement(urgency: Urgency): 'top' | 'bottom' | null {
  if (urgency === 'monitor' || urgency === 'home_care') return 'top'
  if (urgency === 'urgent' || urgency === 'emergency') return 'bottom'
  return null
}

// Which cases are due, one per pet, and «скрыть до завтра»: shared with the phone.
export { dueCases as dueBanners, tomorrowMorning } from '@lapka/shared'

/** How many banners the overview shows before «Ещё N случаев». */
export const BANNER_LIMIT = 2

/** «23 октября» / «October 23». */
export function formatDay(iso: string | Date, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', timeZone }).format(new Date(iso))
}

/** «09:00» / «9:00 AM». */
export function formatTime(iso: string | Date, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

/** «23 октября · 09:00». */
export function formatDayTime(iso: string | Date, locale: Locale, timeZone?: string): string {
  return `${formatDay(iso, locale, timeZone)} · ${formatTime(iso, locale, timeZone)}`
}

/** The calendar day of a moment, `YYYY-MM-DD`, in a zone (the runtime's own without one). */
function dayKey(moment: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment)
}

/** «сегодня в 09:00», «завтра в 09:00», «25 октября в 09:00». */
export function formatWhen(moment: Date, now: Date, locale: Locale, words: Words, timeZone?: string): string {
  const time = formatTime(moment, locale, timeZone)
  const day = dayKey(moment, timeZone)
  if (day === dayKey(now, timeZone)) return words.whenToday.replace('{time}', time)
  if (day === dayKey(new Date(now.getTime() + DAY_MS), timeZone)) return words.whenTomorrow.replace('{time}', time)
  return words.whenDate.replace('{date}', formatDay(moment, locale, timeZone)).replace('{time}', time)
}

/**
 * When the next question rings, in words — the shared quiet-hours rule on the
 * clock of the browser that renders it. Call it only in the browser: on the
 * server the runtime's zone is not the owner's.
 */
export function nextQuestionWhen(dueAt: string, now: Date, locale: Locale, words: Words): string {
  return formatWhen(followupFireMoment(new Date(dueAt)), now, locale, words)
}

/** «23–25 октября», «30 сентября – 2 октября», «23 октября». */
export function formatDayRange(from: string, to: string, locale: Locale, timeZone?: string): string {
  const parts = (iso: string) => {
    const found = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', timeZone }).formatToParts(new Date(iso))
    const get = (type: Intl.DateTimeFormatPartTypes) => found.find((part) => part.type === type)?.value ?? ''
    return { day: get('day'), month: get('month') }
  }
  const start = parts(from)
  const end = parts(to)
  if (start.day === end.day && start.month === end.month) return formatDay(from, locale, timeZone)
  if (start.month === end.month) {
    return locale === 'ru' ? `${start.day}–${end.day} ${start.month}` : `${start.month} ${start.day}–${end.day}`
  }
  return `${formatDay(from, locale, timeZone)} – ${formatDay(to, locale, timeZone)}`
}

/** «Прошло 2 дня»: how long since the check the schedule counted from. */
export function sinceCheck(fromIso: string, now: Date, words: Words, locale: Locale): string {
  const hours = Math.max(1, Math.round((now.getTime() - new Date(fromIso).getTime()) / HOUR_MS))
  if (hours < 24) return formatCount(words.hours, hours, locale)
  return formatCount(words.days, Math.round(hours / 24), locale)
}

/** The answer in words: «Лучше», «Да, были у врача», «Ещё не были у врача · Хуже». */
export function answerLabel(words: Words, checkin: { state: FollowupState; vet_visited: boolean | null }): string {
  if (checkin.vet_visited === true) return words.vetSeenAnswer
  if (checkin.vet_visited === false) return words.vetNotYetAnswer.replace('{state}', words.states[checkin.state])
  return words.states[checkin.state]
}

/** The tone of an outcome panel: calm green or the peach of «к врачу». */
export function decisionTone(decision: FollowupDecision): 'calm' | 'vet' {
  return decision === 'see_vet' || decision === 'see_vet_today' || decision === 'clinic_now' ? 'vet' : 'calm'
}

/** The status of a case in words: «Наблюдаем» while open, the outcome once closed. */
export function caseStatusLabel(words: Words, item: Pick<FollowupCaseSummary, 'status' | 'outcome'>): string {
  return item.status === 'closed' && item.outcome ? words.outcomes[item.outcome] : words.watching
}

/** «Часть случая от 23 октября · 2 отметки». */
export function partOfCase(words: Words, item: FollowupCaseSummary, locale: Locale, timeZone?: string): string {
  const date = formatDay(item.origin_checked_at, locale, timeZone)
  if (item.checkin_count === 0) return words.partOfNoCheckins.replace('{date}', date)
  return words.partOf.replace('{date}', date).replace('{count}', formatCount(words.checkins, item.checkin_count, locale))
}

/**
 * «Учтём проверку от 23 октября и 2 отметки»: the case's latest check — the
 * one the server puts in the prompt — and the answers given since it.
 */
export function recheckPlaque(words: Words, item: Pick<FollowupCase, 'checks' | 'checkins' | 'origin_checked_at'>, locale: Locale, timeZone?: string): string {
  const latest = item.checks.at(-1)?.created_at ?? item.origin_checked_at
  const answers = item.checkins.filter((checkin) => checkin.created_at >= latest).length
  const date = formatDay(latest, locale, timeZone)
  if (answers === 0) return words.recheckPlaqueNoCheckins.replace('{date}', date)
  return words.recheckPlaque.replace('{date}', date).replace('{count}', formatCount(words.checkins, answers, locale))
}

/** The visit form, linked to a check of the case (`pet_health_events.check_id`). */
export function visitFormHref(petId: string, checkId: string): string {
  return `/pets/${petId}/health/new?type=visit&check=${encodeURIComponent(checkId)}`
}

// ---------- History ----------

export type HistoryEntry =
  | { kind: 'check'; check: SymptomCheckRecord }
  | {
      kind: 'case'
      caseId: string
      link: CheckCaseLink
      /** The case's checks in this history, newest first. */
      checks: SymptomCheckRecord[]
    }

/**
 * The history with a case as one row: the checks of a case collapse into
 * the place of its newest one; a check in no case — or in a case still
 * `off` — stays a row of its own, as before.
 */
export function groupHistory(checks: SymptomCheckRecord[], links: ReadonlyMap<string, CheckCaseLink>): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  const byCase = new Map<string, Extract<HistoryEntry, { kind: 'case' }>>()
  for (const check of checks) {
    const link = links.get(check.id)
    if (!link || link.status === 'off') {
      entries.push({ kind: 'check', check })
      continue
    }
    const existing = byCase.get(link.case_id)
    if (existing) {
      existing.checks.push(check)
      continue
    }
    const entry = { kind: 'case' as const, caseId: link.case_id, link, checks: [check] }
    byCase.set(link.case_id, entry)
    entries.push(entry)
  }
  return entries
}

/** The checks a list of history entries holds, case rows included. */
export function entryChecks(entries: HistoryEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.kind === 'check' ? 1 : entry.checks.length), 0)
}

// ---------- Timeline ----------

export type TimelineEvent =
  | { kind: 'check'; at: string; key: string; check: FollowupCase['checks'][number] }
  | { kind: 'checkin'; at: string; key: string; checkin: FollowupCase['checkins'][number] }
  | { kind: 'visit'; at: string; key: string; visit: FollowupCase['visits'][number] }
  | { kind: 'closed'; at: string; key: string; outcome: NonNullable<FollowupCase['outcome']> }

/**
 * The case's checks, answers, visits and its closing, oldest first. A visit
 * has a day, not a moment: it is placed at noon UTC of that day, enough to
 * sort it among the day's events without inventing a time to show.
 */
export function caseTimeline(item: FollowupCase): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...item.checks.map((check) => ({ kind: 'check' as const, at: check.created_at, key: `check-${check.check_id}`, check })),
    ...item.checkins.map((checkin) => ({ kind: 'checkin' as const, at: checkin.created_at, key: `checkin-${checkin.id}`, checkin })),
    ...item.visits.map((visit) => ({ kind: 'visit' as const, at: `${visit.date}T12:00:00.000Z`, key: `visit-${visit.event_id}`, visit })),
  ]
  if (item.status === 'closed' && item.closed_at && item.outcome) {
    events.push({ kind: 'closed', at: item.closed_at, key: 'closed', outcome: item.outcome })
  }
  // Stable: a check-in written in the same second as its closing stays before it.
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at.localeCompare(b.event.at) || a.index - b.index)
    .map(({ event }) => event)
}

/** The case's dates for its heading: from the first check to the closing, or to its latest event while open. */
export function caseSpan(item: FollowupCase): { from: string; to: string } {
  const timeline = caseTimeline(item)
  const from = item.origin_checked_at
  const to = item.closed_at ?? timeline.at(-1)?.at ?? from
  return { from, to: to < from ? from : to }
}

// ---------- Health record ----------

/** How many «Перенесённые случаи» the record lists before «Все случаи · N». */
export const EPISODE_LIMIT = 3

/** The episodes a vet summary lists: closed within six months of now. */
export function recentEpisodes(items: PastEpisode[], now: Date): PastEpisode[] {
  const since = new Date(now.getTime())
  since.setMonth(since.getMonth() - 6)
  return items.filter((item) => new Date(item.closed_at).getTime() >= since.getTime())
}

/** «Кошка · Сибирская · 6 лет»: the species, then the profile's line when the pet is known. */
export function petLineOf(species: string | null | undefined, profileLine: string, dict: Dictionary): string {
  const word = species === 'dog' ? dict.check.speciesDog : species === 'cat' ? dict.check.speciesCat : ''
  return [word, profileLine].filter(Boolean).join(' · ')
}
