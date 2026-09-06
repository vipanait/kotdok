export const APPETITE_LABELS: Record<string, string> = {
  normal: 'Ест нормально',
  reduced: 'Ест меньше',
  none: 'Не ест',
}

export const ACTIVITY_LABELS: Record<string, string> = {
  normal: 'Бодрый',
  low: 'Менее активный',
  lethargic: 'Вялый',
}

export const DURATION_LABELS: Record<string, string> = {
  today: 'Сегодня',
  '2-3days': '2–3 дня',
  'week+': 'Больше недели',
}

export const STOOL_LABELS: Record<string, string> = {
  normal: 'Нормальный',
  loose: 'Жидкий (понос)',
  absent: 'Отсутствует',
  bloody: 'С кровью',
}

export const VALID_PAIN_SIGNS = [
  'tense',
  'hunched',
  'grimace',
  'touch_sensitive',
  'hiding',
  'vocalizing',
] as const

export type PainSign = (typeof VALID_PAIN_SIGNS)[number]

export const PAIN_SIGN_LABELS: Record<PainSign, string> = {
  tense: 'Напряжён / скован',
  hunched: 'Сгорбленная поза',
  grimace: 'Прищур / гримаса',
  touch_sensitive: 'Болезненно на касание',
  hiding: 'Прячется больше обычного',
  vocalizing: 'Жалобные звуки',
}

/** English labels for the AI quick-assessment prompt. */
export const PAIN_SIGN_PROMPT_LABELS: Record<PainSign, string> = {
  tense: 'tense/rigid body',
  hunched: 'hunched posture',
  grimace: 'squinting/facial grimace',
  touch_sensitive: 'painful or sensitive to touch',
  hiding: 'hiding more than usual',
  vocalizing: 'distress vocalizing',
}

const VALID_PAIN_SIGN_SET = new Set<string>(VALID_PAIN_SIGNS)

/**
 * Normalize pain_signs from JSON array, comma-separated string, or unknown junk.
 * Keeps allowlisted values only, in stable allowlist order, without duplicates.
 */
export function sanitizePainSigns(raw: unknown): string[] {
  let candidates: string[] = []

  if (Array.isArray(raw)) {
    candidates = raw.map(v => String(v ?? '').trim()).filter(Boolean)
  } else if (typeof raw === 'string' && raw.trim()) {
    candidates = raw.split(',').map(s => s.trim()).filter(Boolean)
  }

  const selected = new Set(candidates.filter(v => VALID_PAIN_SIGN_SET.has(v)))
  return VALID_PAIN_SIGNS.filter(v => selected.has(v))
}
