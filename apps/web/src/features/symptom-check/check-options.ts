import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  STOOL_VALUES,
} from '@lapka/contracts'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount, type PluralForms } from '@/shared/i18n/plural'
import type { Pet } from '@/shared/types'

/** What the check form and the result aside show about a pet. */
export type CheckPet = Pick<Pet, 'id' | 'name' | 'species' | 'breed' | 'age_years'>

export interface CheckOption {
  value: string
  label: string
}

type CheckDict = Dictionary['check']

/**
 * The quick-assessment answers of a check, labelled. The value sets come from
 * the contract, so the form offers exactly what the API accepts — all four
 * durations included — and the result can name every stored answer.
 */
export function checkOptions(t: CheckDict) {
  const appetite: Record<(typeof APPETITE_VALUES)[number], string> = {
    normal: t.appetiteNormal,
    reduced: t.appetiteReduced,
    none: t.appetiteNone,
  }
  const activity: Record<(typeof ACTIVITY_VALUES)[number], string> = {
    normal: t.activityNormal,
    low: t.activityLow,
    lethargic: t.activityLethargic,
  }
  const duration: Record<(typeof DURATION_VALUES)[number], string> = {
    today: t.durationToday,
    '2-3days': t.duration2_3days,
    '4-7days': t.duration4_7days,
    'week+': t.durationWeekPlus,
  }
  const stool: Record<(typeof STOOL_VALUES)[number], string> = {
    normal: t.stoolNormal,
    loose: t.stoolLoose,
    absent: t.stoolAbsent,
    bloody: t.stoolBloody,
  }
  const painSigns: Record<(typeof PAIN_SIGNS)[number], string> = {
    tense: t.painTense,
    hunched: t.painHunched,
    grimace: t.painGrimace,
    touch_sensitive: t.painTouchSensitive,
    hiding: t.painHiding,
    vocalizing: t.painVocalizing,
  }

  const list = (values: readonly string[], labels: Record<string, string>): CheckOption[] =>
    values.map(value => ({ value, label: labels[value] }))

  return {
    appetite: list(APPETITE_VALUES, appetite),
    activity: list(ACTIVITY_VALUES, activity),
    duration: list(DURATION_VALUES, duration),
    stool: list(STOOL_VALUES, stool),
    painSigns: list(PAIN_SIGNS, painSigns),
    labels: { appetite, activity, duration, stool, painSigns } as Record<
      'appetite' | 'activity' | 'duration' | 'stool' | 'painSigns',
      Record<string, string>
    >,
  }
}

function intlLocale(locale: Locale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US'
}

/** "3 года", "1,5 года", "1 year". */
export function formatPetAge(forms: PluralForms, years: number, locale: Locale): string {
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(years)
  return formatCount(forms, years, locale).replace(String(years), number)
}

/** "Сибирская · 3 года": whatever of breed and age the profile has. */
export function petSummary(
  pet: { breed?: string | null; age_years?: number | null },
  t: CheckDict,
  locale: Locale,
  separator = ' · ',
): string {
  const parts: string[] = []
  if (pet.breed) parts.push(pet.breed)
  if (pet.age_years != null && pet.age_years > 0) parts.push(formatPetAge(t.petAge, pet.age_years, locale))
  return parts.join(separator)
}

/**
 * "23 сентября 2026, 12:40" / "September 23, 2026, 12:40 PM". Built from parts
 * because the plain Russian format adds "г." and "в".
 */
export function formatCheckDateTime(iso: string, locale: Locale, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  const time = `${get('hour')}:${get('minute')}`
  if (locale === 'ru') return `${get('day')} ${get('month')} ${get('year')}, ${time}`
  const period = get('dayPeriod')
  return `${get('month')} ${get('day')}, ${get('year')}, ${time}${period ? ` ${period}` : ''}`
}

/** Year and month of a moment on the owner's clock: groups the history. */
export function monthKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone })
    .formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** "Сентябрь 2026" / "September 2026": the heading of a month in the history. */
export function formatMonthHeading(iso: string, locale: Locale, timeZone: string): string {
  const date = new Date(iso)
  // `month: 'long'` on its own gives the nominative ("сентябрь"), not "сентября".
  const month = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone }).format(date)
  const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(date)
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`
}
