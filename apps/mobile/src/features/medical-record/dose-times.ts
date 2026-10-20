import { MEDICATION_TIMES_MAX } from '@lapka/contracts'

/** «7:30», «0730», «07.30» → «07:30»; null for what is not a time of day. */
export function readTime(text: string): string | null {
  const match = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(text)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function toggleTime(times: readonly string[], time: string): string[] {
  if (times.includes(time)) return times.filter((t) => t !== time)
  return addTime(times, time)
}

export function addTime(times: readonly string[], time: string): string[] {
  if (times.includes(time) || times.length >= MEDICATION_TIMES_MAX) return [...times]
  return [...times, time].sort()
}
