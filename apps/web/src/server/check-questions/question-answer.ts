import type { CheckQuestionAlert, Locale, Urgency } from '@lapka/contracts'
import { CHECK_QUESTION_ALERTS } from '@lapka/contracts'

/**
 * What the owner reads when the question was not about this check. Fixed, so
 * the three free questions cannot be turned into a general chat, and so the
 * refusal never depends on how the model chose to word it.
 */
export const OFF_TOPIC_ANSWER: Record<Locale, string> = {
  ru: 'Я могу ответить только на вопросы по этой проверке.',
  en: 'I can only answer questions about this check.',
}

/** Longest answer kept. The prompt asks for 120 words; this is the guard behind it. */
export const ANSWER_MAX = 1500

export type NormalizedAnswer = { answer: string; alert: CheckQuestionAlert; offTopic: boolean }

const ALERT_RANK: Record<CheckQuestionAlert, number> = { none: 0, see_vet_today: 1, clinic_now: 2 }

/** How far the check itself already sends the owner, on the alert's scale. */
function urgencyRank(urgency: Urgency): number {
  return urgency === 'emergency' ? 2 : urgency === 'urgent' ? 1 : 0
}

function cut(text: string): string {
  const letters = Array.from(text)
  if (letters.length <= ANSWER_MAX) return text
  const head = letters.slice(0, ANSWER_MAX).join('')
  const end = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'), head.lastIndexOf('…'))
  return end > 0 ? head.slice(0, end + 1) : `${letters.slice(0, ANSWER_MAX - 1).join('')}…`
}

/**
 * Turns the model's JSON into what is stored, trusting none of it.
 *
 * An alert only ever adds to the check: one that says no more than the check's
 * own level already does is dropped, so an emergency result never grows a
 * second, weaker instruction under it. An off-topic question gets the fixed
 * sentence and no alert.
 *
 * @throws when the text is not JSON or holds no answer — the caller gives the
 * question's place back.
 */
export function normalizeAnswer(raw: string, checkUrgency: Urgency, locale: Locale): NormalizedAnswer {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('answer is not an object')
  const r = parsed as Record<string, unknown>

  if (r.off_topic === true) return { answer: OFF_TOPIC_ANSWER[locale], alert: 'none', offTopic: true }

  const answer = typeof r.answer === 'string' ? r.answer.trim() : ''
  if (!answer) throw new Error('answer is empty')

  const said = CHECK_QUESTION_ALERTS.find((alert) => alert === r.alert) ?? 'none'
  const alert = ALERT_RANK[said] > urgencyRank(checkUrgency) ? said : 'none'

  return { answer: cut(answer), alert, offTopic: false }
}
