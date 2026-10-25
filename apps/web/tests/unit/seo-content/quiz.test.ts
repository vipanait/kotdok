import { describe, expect, it } from 'vitest'
import { quizOutcome, type QuizRule } from '@/features/seo-content/quiz'

const rules: QuizRule[] = [
  { level: 'emergency' },
  { level: 'emergency' },
  { level: 'urgent' },
  { level: 'urgent' },
  { level: 'urgent' },
]

describe('«Это срочно?»', () => {
  it('says ЭКСТРЕННО at the first yes to an emergency question, without waiting for the rest', () => {
    expect(quizOutcome(rules, [null, true, null, null, null])).toBe('emergency')
    expect(quizOutcome(rules, [true, false, true, true, true])).toBe('emergency')
  })

  it('waits for every answer before anything less than an emergency', () => {
    expect(quizOutcome(rules, [false, false, true, null, null])).toBeNull()
    expect(quizOutcome(rules, [])).toBeNull()
  })

  it('says СРОЧНО when an urgent question got a yes and no emergency one did', () => {
    expect(quizOutcome(rules, [false, false, false, true, false])).toBe('urgent')
  })

  it('never goes below НАБЛЮДАЕМ: it cannot see the pet', () => {
    expect(quizOutcome(rules, [false, false, false, false, false])).toBe('monitor')
    // Every combination of answers, so «home care» and «healthy» stay out of reach.
    for (let mask = 0; mask < 2 ** rules.length; mask++) {
      const answers = rules.map((_, i) => Boolean(mask & (1 << i)))
      expect(['emergency', 'urgent', 'monitor']).toContain(quizOutcome(rules, answers))
    }
  })
})
