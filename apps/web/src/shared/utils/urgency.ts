/**
 * The five urgency levels a check can come back with, most urgent first.
 *
 * Colour lives in CSS (`.emergency`, `.urgent`, … in globals.css set
 * `--signal` and `--tint`); a level is never shown by colour alone — the
 * badge and the result hero always carry its name.
 */
export const URGENCY_KEYS = ['emergency', 'urgent', 'monitor', 'home_care', 'healthy'] as const

export type UrgencyKey = (typeof URGENCY_KEYS)[number]

export function isUrgencyKey(value: unknown): value is UrgencyKey {
  return typeof value === 'string' && (URGENCY_KEYS as readonly string[]).includes(value)
}

/** Levels whose first action is getting to a clinic. */
export const CLINIC_URGENCIES: ReadonlySet<UrgencyKey> = new Set(['emergency', 'urgent'])

/** Levels where the owner is heading to a vet, so questions for the vet matter. */
export const VET_URGENCIES: ReadonlySet<UrgencyKey> = new Set(['emergency', 'urgent', 'monitor'])

/** "НАБЛЮДАЕМ" → "Наблюдаем": the dictionary keeps the shouting form for the app. */
export function urgencyTitle(label: string | undefined): string {
  if (!label) return ''
  return label.charAt(0) + label.slice(1).toLowerCase()
}
