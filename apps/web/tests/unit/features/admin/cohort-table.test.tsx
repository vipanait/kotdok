import { describe, expect, it } from 'vitest'
import CohortTable from '@/features/admin/CohortTable'
import ShareBars from '@/features/admin/ShareBars'
import { render, tags } from '../../components/static-render'

describe('the cohort table', () => {
  it('shows the share of each cohort active per week and leaves unfinished weeks empty', () => {
    const html = render(<CohortTable cohorts={[{ weekStart: '2026-09-14', size: 40, active: [24, 8, null, null, null] }]} />)
    const cells = tags(html, 'td').map((td) => td.text)
    expect(cells).toEqual(['40', '60%', '20%', '', '', ''])
    expect(tags(html, 'th').some((th) => th.text.includes('14–20'))).toBe(true)
  })

  it('shows a dash for an empty cohort rather than a share of nobody', () => {
    const html = render(<CohortTable cohorts={[{ weekStart: '2026-09-21', size: 0, active: [0, 0, 0, 0, 0] }]} />)
    expect(tags(html, 'td').map((td) => td.text)).toEqual(['0', '—', '—', '—', '—', '—'])
  })

  it('names a week that crosses months by both months', () => {
    const html = render(<CohortTable cohorts={[{ weekStart: '2026-09-28', size: 1, active: [1, null, null, null, null] }]} />)
    const head = tags(html, 'th').find((th) => th.text.includes('28'))!
    expect(head.text).toMatch(/28 сент\.? – 4 окт/)
  })
})

describe('share bars', () => {
  it('shows each item with its share of the total and its count, largest first', () => {
    const html = render(<ShareBars label="Вход" items={[{ label: 'Почта', count: 1 }, { label: 'Apple', count: 3 }]} />)
    const rows = tags(html, 'li').map((li) => li.text)
    expect(rows).toEqual(['Apple75% · 3', 'Почта25% · 1'])
  })

  it('says there is nothing when every count is zero', () => {
    expect(render(<ShareBars label="Вход" items={[{ label: 'Apple', count: 0 }]} />)).toContain('Пока нет данных')
  })
})
