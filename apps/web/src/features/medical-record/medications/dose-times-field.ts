import { MEDICATION_TIMES_MAX } from '@lapka/contracts'
import { addTime, readTime, removeTime } from '@lapka/shared'

/**
 * «Время приёма» of a course (FB-5/01, design `medication`): the usual
 * times to tick and «Своё время» with «+». Each change is the whole new
 * list — the API's `MedicationTimesSchema` replaces the stored list — so
 * the rules here are the contract's: «ЧЧ:ММ», no repeats, at most four.
 */

export type TimesChange = { ok: true; times: string[] } | { ok: false; reason: 'format' | 'repeat' | 'max' }

/** The times offered to tick (the phone's presets). */
const PRESETS = ['08:00', '12:00', '20:00']

export function presetTimes(times: readonly string[]): string[] {
  return [...new Set([...PRESETS, ...times])].sort()
}

export function addTypedTime(times: readonly string[], text: string): TimesChange {
  const time = readTime(text)
  if (!time) return { ok: false, reason: 'format' }
  if (times.includes(time)) return { ok: false, reason: 'repeat' }
  if (times.length >= MEDICATION_TIMES_MAX) return { ok: false, reason: 'max' }
  return { ok: true, times: addTime(times, time) }
}

export function togglePreset(times: readonly string[], time: string): TimesChange {
  if (times.includes(time)) return { ok: true, times: removeTime(times, time) }
  if (times.length >= MEDICATION_TIMES_MAX) return { ok: false, reason: 'max' }
  return { ok: true, times: addTime(times, time) }
}
