/** Numbers and dates of the admin pages, in the page's language. */

function intlLocale(locale: string): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US'
}

export function formatNumber(value: number, locale: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(value)
}

export function compactValue(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** A fraction as a percent; one decimal below 10 %, where whole percents hide failures. */
export function formatPercent(fraction: number | null, locale: string): string {
  if (fraction === null) return '—'
  const percent = fraction * 100
  return `${formatNumber(percent, locale, percent > 0 && percent < 10 ? 1 : 0)}%`
}

/** A Moscow date key ("2026-11-05") as "5 ноября". */
export function formatDate(value: string | undefined, locale: string, month: 'long' | 'short' = 'long'): string {
  if (!value) return ''
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(intlLocale(locale), { day: 'numeric', month, timeZone: 'UTC' })
}

/** A moment as Moscow time: "5 нояб., 11:42". */
export function formatMoment(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  })
}
