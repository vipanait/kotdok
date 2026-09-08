import type { Locale } from '@lapka/contracts'

/**
 * The language the analysis answers in.
 *
 * The prompt used to say "All text fields must be in Russian" and nothing read
 * the account's language, so a person who chose English was told their answers
 * would arrive in it and then received Russian. The choice now reaches the
 * model.
 *
 * The example values matter as much as the instruction: a JSON skeleton filled
 * with Russian placeholders pulls the answer back to Russian however the
 * instruction is worded. So each language brings its own skeleton.
 */

const LANGUAGE_NAME: Record<Locale, string> = {
  ru: 'Russian',
  en: 'English',
}

/** Filled into the OUTPUT FORMAT skeleton so nothing anchors the wrong way. */
const EXAMPLES: Record<Locale, Record<string, string>> = {
  ru: {
    reason: 'одно предложение почему',
    photo: 'что видно на фото, или null если фото нет',
    cause: 'причина',
    warning: 'видоспецифичное предупреждение или null',
    missing: 'какой информации о питомце не хватает для более точной оценки',
    step: 'шаг',
    question: 'вопрос',
  },
  en: {
    reason: 'one sentence on why',
    photo: 'what is visible in the photo, or null if there is none',
    cause: 'cause',
    warning: 'species-specific warning, or null',
    missing: 'what is missing about the pet that would sharpen the triage',
    step: 'step',
    question: 'question',
  },
}

/**
 * The standing note that this is not a diagnosis.
 *
 * Used when the model omits it. It is the one sentence a person must not be
 * left without, so it never depends on the model remembering to send it.
 */
export const DISCLAIMER: Record<Locale, string> = {
  ru: 'Лапка — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста.',
  en: 'Lapka is an informational tool. It is not a veterinary diagnosis and does not replace an examination by a specialist.',
}

/** The one-line reassurance a HEALTHY answer may carry, shown as an example. */
export const REASSURANCE: Record<Locale, string> = {
  ru: 'Продолжайте обычный уход',
  en: 'Continue regular care',
}

export function outputFormat(locale: Locale): string {
  const e = EXAMPLES[locale]

  return `OUTPUT FORMAT (always valid JSON, no markdown). All text fields must be in ${LANGUAGE_NAME[locale]}.

{
  "urgency": "emergency|urgent|monitor|home_care|healthy",
  "urgency_reason": "${e.reason}",
  "photo_observations": "${e.photo}",
  "possible_causes": ["${e.cause} 1", "${e.cause} 2", "${e.cause} 3"],
  "species_specific_warning": "${e.warning}",
  "additional_pet_info_needed": ["${e.missing}"],
  "home_care_steps": ["${e.step} 1", "${e.step} 2"],
  "vet_questions": ["${e.question} 1", "${e.question} 2"],
  "disclaimer": "${DISCLAIMER[locale]}"
}

CONTEXT FROM VET DATABASE:
{context}`
}
