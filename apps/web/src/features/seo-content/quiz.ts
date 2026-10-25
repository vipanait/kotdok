/**
 * «Это срочно?» on a symptom page: yes/no questions, each one raising the
 * answer to `emergency` or `urgent`. Counted in the browser, from the rules in
 * the page's JSON — no model, no request.
 *
 * The block never says «Домашний уход» or «Всё в порядке»: it cannot see the
 * pet, and false reassurance is the one mistake worth designing against. With
 * no alarming answer the floor is «Наблюдаем», the level whose instruction
 * already says to see a vet if things get worse.
 */

export type QuizLevel = 'emergency' | 'urgent'
export type QuizOutcome = 'emergency' | 'urgent' | 'monitor'

export interface QuizRule {
  level: QuizLevel
}

/** One entry per question: `true` yes, `false` no, `null` not answered yet. */
export type QuizAnswers = ReadonlyArray<boolean | null>

/**
 * The outcome so far, or `null` while it is not known yet. A yes to an
 * emergency question decides it at once — nobody should finish a questionnaire
 * first — otherwise every question needs an answer.
 */
export function quizOutcome(rules: readonly QuizRule[], answers: QuizAnswers): QuizOutcome | null {
  const yes = (level: QuizLevel) => rules.some((rule, i) => rule.level === level && answers[i] === true)

  if (yes('emergency')) return 'emergency'
  if (rules.some((_, i) => answers[i] == null)) return null
  if (yes('urgent')) return 'urgent'
  return 'monitor'
}
