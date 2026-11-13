import { describe, expect, it } from 'vitest'
import {
  CHECK_QUESTION_LIMIT,
  CHECK_QUESTION_MAX,
  CHECK_QUESTION_WINDOW_HOURS,
  CheckQuestionInputSchema,
  CheckQuestionResultSchema,
  CheckQuestionThreadSchema,
} from '@lapka/contracts'

const item = {
  id: '11111111-1111-4111-8111-000000000001',
  question: 'Можно ли кормить?',
  answer: 'Небольшими порциями.',
  alert: 'none',
  off_topic: false,
  created_at: '2026-11-13T10:00:00.000Z',
}
const thread = {
  items: [item],
  limit: 3,
  remaining: 2,
  open_until: '2026-11-15T09:00:00.000Z',
  closed: null,
}

describe('check questions contract', () => {
  it('pins the owner decisions of 13 November 2026', () => {
    expect(CHECK_QUESTION_LIMIT).toBe(3)
    expect(CHECK_QUESTION_WINDOW_HOURS).toBe(48)
    expect(CHECK_QUESTION_MAX).toBe(500)
  })

  it('trims a question before measuring it', () => {
    expect(CheckQuestionInputSchema.parse({ question: '  ест?  ' })).toEqual({ question: 'ест?' })
    expect(CheckQuestionInputSchema.safeParse({ question: '  a ' }).success).toBe(false)
  })

  it('refuses a question longer than 500 characters and an unknown key', () => {
    expect(CheckQuestionInputSchema.safeParse({ question: 'я'.repeat(501) }).success).toBe(false)
    expect(CheckQuestionInputSchema.safeParse({ question: 'я'.repeat(500) }).success).toBe(true)
    expect(CheckQuestionInputSchema.safeParse({ question: 'ест ли?', extra: 1 }).success).toBe(false)
  })

  it('reads a thread a later server added a field to', () => {
    const read = CheckQuestionThreadSchema.safeParse({ ...thread, later: true, items: [{ ...item, later: 1 }] })
    expect(read.success).toBe(true)
  })

  it('knows only the three alerts and the two closed reasons', () => {
    expect(CheckQuestionThreadSchema.safeParse({ ...thread, items: [{ ...item, alert: 'panic' }] }).success).toBe(false)
    expect(CheckQuestionThreadSchema.safeParse({ ...thread, closed: 'limit' }).success).toBe(true)
    expect(CheckQuestionThreadSchema.safeParse({ ...thread, closed: 'bored' }).success).toBe(false)
    expect(CheckQuestionResultSchema.safeParse({ item, thread }).success).toBe(true)
  })
})
