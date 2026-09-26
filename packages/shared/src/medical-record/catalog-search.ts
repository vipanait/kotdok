/**
 * Searching the catalogue of vaccines and treatments, the same way on the
 * server and on the phone: case, «ё» and the keyboard layout do not matter,
 * so «нобив», «НОБИВ», «nobiv» and «yj,bd» — «нобив» typed on an English
 * layout — all find Нобивак.
 */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё'

const EN_TO_RU = new Map([...EN].map((char, index) => [char, RU[index]]))
const RU_TO_EN = new Map([...RU].map((char, index) => [char, EN[index]]))

function retype(text: string, table: Map<string, string>): string {
  return [...text].map((char) => table.get(char) ?? char).join('')
}

/** Lower case, «ё» as «е», single spaces. */
export function normaliseQuery(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

export type Searchable = { name: string; manufacturer: string | null; aliases?: readonly string[] }

/** Whether a catalogue entry answers a query, as typed or as typed on the other layout. */
export function matchesCatalog(entry: Searchable, query: string): boolean {
  const typed = normaliseQuery(query)
  if (typed === '') return true

  const haystack = normaliseQuery([entry.name, entry.manufacturer ?? '', ...(entry.aliases ?? [])].join(' '))
  const lowered = query.toLowerCase().trim()
  const variants = [typed, normaliseQuery(retype(lowered, EN_TO_RU)), normaliseQuery(retype(lowered, RU_TO_EN))]
  return variants.some((variant) => variant !== '' && haystack.includes(variant))
}

export type Interval = { value: number; unit: 'day' | 'week' | 'month' | 'year' }

/**
 * A calendar day moved by an interval. Weeks are seven days and months are
 * months: 12 weeks from 24 September is 17 December, 3 months is 24 December.
 * A day the target month lacks becomes its last day.
 */
export function addInterval(day: string, interval: Interval): string {
  const [year, month, date] = day.split('-').map(Number)
  if (interval.unit === 'day' || interval.unit === 'week') {
    const days = interval.unit === 'week' ? interval.value * 7 : interval.value
    return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
  }
  const months = interval.unit === 'year' ? interval.value * 12 : interval.value
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date, lastDay))
  return target.toISOString().slice(0, 10)
}
