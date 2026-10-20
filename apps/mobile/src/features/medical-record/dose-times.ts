import { MEDICATION_TIMES_MAX } from '@lapka/contracts'

/** Between hours and minutes: the colon, and what a keyboard or a paste gives instead. */
const SEPARATOR = '[:.;,\\s-]'

/**
 * «7:30», «07.30», «7 30», «7;30» (a keyboard's other colon), «0730» →
 * «07:30»; null for what is not a time of day. Without a separator it takes
 * four digits only: «123» is someone still typing «12:30», not 01:23.
 */
export function readTime(text: string): string | null {
  const match = new RegExp(`^\\s*(?:(\\d{1,2})${SEPARATOR}+(\\d{2})|(\\d{2})(\\d{2}))\\s*$`).exec(text)
  if (!match) return null
  const hour = Number(match[1] ?? match[3])
  const minute = Number(match[2] ?? match[4])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * What the field holds after an edit. A whole time, typed or pasted, reads as
 * «ЧЧ:ММ»; a time on its way («1», «12», «12:», «123») stays as typed, and so
 * does a deletion. Anything that cannot become a time — letters, a second
 * time stuck to the first — keeps the field as it was.
 */
export function editTime(previous: string, next: string): string {
  const whole = readTime(next)
  if (whole && (next.length >= 4 || /\D/.test(next.trim()))) return whole
  const text = next.replace(/\s+/g, ' ')
  if (text === '' || new RegExp(`^\\d{1,2}(?:${SEPARATOR}\\d{0,2})?$|^\\d{3,4}$`).test(text)) return text
  return previous
}

export function toggleTime(times: readonly string[], time: string): string[] {
  if (times.includes(time)) return times.filter((t) => t !== time)
  return addTime(times, time)
}

export function addTime(times: readonly string[], time: string): string[] {
  if (times.includes(time) || times.length >= MEDICATION_TIMES_MAX) return [...times]
  return [...times, time].sort()
}
