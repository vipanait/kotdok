/**
 * Turning the symptom form into what the contract accepts, and the wording
 * around it.
 *
 * Apart from the screen so it can be tested. The rules here are the ones the
 * server would otherwise enforce with a 400 that says only "does not match the
 * contract" — which tells the person nothing about which answer was the
 * problem.
 */

import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  STOOL_VALUES,
  SYMPTOMS_MAX,
  SYMPTOMS_MIN,
  type CheckCreateInput,
} from '@lapka/contracts'

export type CheckForm = {
  petId: string | null
  symptoms: string
  appetite: (typeof APPETITE_VALUES)[number] | null
  activity: (typeof ACTIVITY_VALUES)[number] | null
  duration: (typeof DURATION_VALUES)[number] | null
  stool: (typeof STOOL_VALUES)[number] | null
  painSigns: (typeof PAIN_SIGNS)[number][]
}

export const emptyCheckForm = (petId: string | null = null): CheckForm => ({
  petId,
  symptoms: '',
  appetite: null,
  activity: null,
  duration: null,
  stool: null,
  painSigns: [],
})

export const appetiteLabels = {
  normal: 'Ест нормально',
  reduced: 'Ест меньше',
  none: 'Не ест',
} as const

export const activityLabels = {
  normal: 'Бодрый',
  low: 'Менее активный',
  lethargic: 'Вялый',
} as const

export const durationLabels = {
  today: 'Сегодня',
  '2-3days': '2–3 дня',
  'week+': 'Больше недели',
} as const

export const stoolLabels = {
  normal: 'Нормальный',
  loose: 'Жидкий (понос)',
  absent: 'Отсутствует',
  bloody: 'С кровью',
} as const

/** Pain signs are worded on the site; the values themselves are the contract's. */
export const painLabels: Record<(typeof PAIN_SIGNS)[number], string> = {
  tense: 'Напряжён / скован',
  hunched: 'Сгорбленная поза',
  grimace: 'Прищур / гримаса',
  touch_sensitive: 'Болезненно на касание',
  hiding: 'Прячется больше обычного',
  vocalizing: 'Жалобные звуки',
}

export function toggleSign(
  signs: readonly (typeof PAIN_SIGNS)[number][],
  sign: (typeof PAIN_SIGNS)[number],
): (typeof PAIN_SIGNS)[number][] {
  return signs.includes(sign) ? signs.filter((item) => item !== sign) : [...signs, sign]
}

export type CheckFormResult =
  | { ok: true; value: CheckCreateInput }
  | { ok: false; message: string }

/**
 * @returns what to send, or why it cannot be sent yet.
 *
 * The lower bound is the contract's, and it exists for a reason worth saying
 * out loud: two characters of symptoms produce an analysis of nothing, and the
 * person is charged a credit for it.
 */
export function formToCheckInput(form: CheckForm): CheckFormResult {
  const symptoms = form.symptoms.trim()

  if (symptoms.length < SYMPTOMS_MIN) {
    return { ok: false, message: `Опишите симптомы — хотя бы ${SYMPTOMS_MIN} символа` }
  }
  if (symptoms.length > SYMPTOMS_MAX) {
    return { ok: false, message: `Слишком длинное описание, предел ${SYMPTOMS_MAX} символов` }
  }

  return {
    ok: true,
    value: {
      pet_id: form.petId,
      symptoms,
      upload_ids: [],
      appetite: form.appetite,
      activity: form.activity,
      duration: form.duration,
      stool: form.stool,
      pain_signs: form.painSigns,
    },
  }
}

/**
 * A key that identifies this attempt, so a retry after a lost answer is not
 * charged twice. Regenerated only when the form is submitted afresh — reusing
 * it is the entire point.
 */
export function newIdempotencyKey(random: () => string = () => Math.random().toString(36).slice(2)) {
  return `check-${Date.now().toString(36)}-${random()}${random()}`
}
