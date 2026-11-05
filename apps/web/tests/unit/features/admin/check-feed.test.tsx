import { describe, expect, it } from 'vitest'
import AnswersBlock from '@/features/admin/AnswersBlock'
import CheckFeed from '@/features/admin/CheckFeed'
import type { AdminAnswers, AdminCheckRow } from '@/shared/types/admin'
import { render, tag, tags } from '../../components/static-render'

const OWNER_ID = '11111111-1111-4111-8111-00000000aaaa'

const row: AdminCheckRow = {
  id: 'c1',
  createdAt: '2026-11-05T08:42:00+00:00',
  species: 'cat',
  petAgeYears: 3,
  symptoms: 'Второй день рвёт после еды, пьёт много воды, стала вялой и почти не выходит из-под кровати, ест только влажный корм',
  urgency: 'urgent',
  urgencyReason: 'Рвота больше суток',
  possibleCauses: ['гастрит'],
  homeCareSteps: ['давать воду'],
  vetQuestions: ['когда началось?'],
  answers: { appetite: 'none', activity: null, duration: '2-3days', stool: null, painSigns: ['hiding'] },
  rating: 'disliked',
  comment: 'не помогло',
}

describe('the check feed', () => {
  it('shows a row: time, pet, the start of the complaint, urgency and rating', () => {
    const html = render(<CheckFeed feed={{ rows: [row], hasMore: false }} filter="all" days={30} shown={50} />)
    const summary = tags(html, 'summary')[0]!.text
    expect(summary).toContain('🐈 3 г.')
    expect(summary).toContain('срочно')
    expect(summary).toContain('👎')
    expect(summary).toContain(row.symptoms.slice(0, 80))
    expect(summary).not.toContain(row.symptoms)
    expect(summary).toContain('11:42')
  })

  it('opens into the whole check, with questionnaire answers in words', () => {
    const html = render(<CheckFeed feed={{ rows: [row], hasMore: false }} filter="all" days={30} shown={50} />)
    expect(html).toContain(row.symptoms)
    expect(html).toContain('Рвота больше суток')
    expect(html).toContain('гастрит')
    expect(html).toContain('Не ест')
    expect(html).toContain('2–3 дня')
    expect(html).toContain('Прячется больше обычного')
    expect(html).toContain('не помогло')
  })

  it('links to more rows with the filter kept, and marks the current filter', () => {
    const html = render(<CheckFeed feed={{ rows: [row], hasMore: true }} filter="urgent" days={30} shown={50} />)
    const more = tag(html, 'a', (a) => a.text === 'Показать ещё')
    expect(more.attrs.href).toBe('/admin/statistics/checks?days=30&filter=urgent&shown=100')
    const current = tag(html, 'a', (a) => a.attrs['aria-current'] === 'true')
    expect(current.attrs.href).toBe('/admin/statistics/checks?days=30&filter=urgent')
    expect(tags(html, 'a').some((a) => a.attrs.href === '/admin/statistics/checks?days=30')).toBe(true)
  })

  it('carries nothing that identifies the owner', () => {
    const html = render(<CheckFeed feed={{ rows: [{ ...row, id: 'c2' }], hasMore: false }} filter="all" days={30} shown={50} />)
    expect(html).not.toContain(OWNER_ID)
    expect(html).not.toContain('user_id')
  })

  it('says so when there is nothing', () => {
    expect(render(<CheckFeed feed={{ rows: [], hasMore: false }} filter="disliked" days={7} shown={50} />)).toContain('Проверок нет')
  })
})

describe('the questionnaire block', () => {
  it('names answers in words and counts the unanswered', () => {
    const answers: AdminAnswers = {
      total: 4,
      appetite: { normal: 1, reduced: 0, none: 2, unanswered: 1 },
      activity: { normal: 0, low: 0, lethargic: 0, unanswered: 4 },
      duration: { today: 0, '2-3days': 0, '4-7days': 0, 'week+': 0, unanswered: 4 },
      stool: { normal: 0, loose: 0, absent: 0, bloody: 0, unanswered: 4 },
      pain: { tense: 1, hunched: 0, grimace: 0, touch_sensitive: 0, hiding: 0, vocalizing: 0, any: 1 },
    }
    const html = render(<AnswersBlock answers={answers} />)
    expect(html).toContain('Не ест')
    expect(html).toContain('50% · 2')
    expect(html).toContain('не отвечали')
    expect(html).toContain('Напряжён / скован')
    expect(html).toContain('25%')
  })
})
