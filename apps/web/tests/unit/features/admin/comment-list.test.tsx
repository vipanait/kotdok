import { describe, expect, it } from 'vitest'
import CommentList from '@/features/admin/CommentList'
import type { AdminCheckRow, AdminFeedbackRow } from '@/shared/types/admin'
import { render, tag, tags } from '../../components/static-render'

const check: AdminCheckRow = {
  id: 'c1',
  createdAt: '2026-11-01T08:00:00+00:00',
  species: 'cat',
  petAgeYears: 2,
  symptoms: 'Рвёт с утра, не ест',
  urgency: 'urgent',
  urgencyReason: 'Рвота',
  possibleCauses: [],
  homeCareSteps: [],
  vetQuestions: [],
  answers: { appetite: null, activity: null, duration: null, stool: null, painSigns: [] },
  rating: 'disliked',
  comment: 'Сказали срочно, а оказалось отравление',
}

const withCheck: AdminFeedbackRow = { id: 'f1', at: '2026-11-03T10:00:00+00:00', rating: 'disliked', comment: check.comment!, check }
const withoutCheck: AdminFeedbackRow = { id: 'f2', at: '2026-11-02T10:00:00+00:00', rating: 'liked', comment: 'Удобно', check: null }

describe('the comment list', () => {
  it('opens a comment into its check, and marks old feedback as without one', () => {
    const html = render(<CommentList rows={[withCheck, withoutCheck]} />)
    expect(tags(html, 'details')).toHaveLength(1)
    const summary = tags(html, 'summary')[0]!.text
    expect(summary).toContain('Сказали срочно')
    expect(summary).toContain('срочно')
    expect(summary).toContain('Рвёт с утра')
    expect(html).toContain('без проверки')
    expect(html).toContain('Удобно')
  })

  it('offers filters and more rows when it has controls', () => {
    const html = render(
      <CommentList rows={[withoutCheck]} controls={{ days: 30, filter: 'liked', shown: 50, hasMore: true }} />,
    )
    const current = tag(html, 'a', (a) => a.attrs['aria-current'] === 'true')
    expect(current.attrs.href).toBe('/admin/statistics/feedback?days=30&filter=liked')
    expect(tags(html, 'a').some((a) => a.attrs.href === '/admin/statistics/feedback?days=30&filter=disliked')).toBe(true)
    expect(tag(html, 'a', (a) => a.text === 'Показать ещё').attrs.href).toBe('/admin/statistics/feedback?days=30&filter=liked&shown=100')
  })

  it('has no filters on the overview', () => {
    const html = render(<CommentList rows={[withoutCheck]} />)
    expect(html).not.toContain('Показать ещё')
    expect(tags(html, 'a')).toHaveLength(0)
  })
})
