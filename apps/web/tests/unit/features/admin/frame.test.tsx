import { describe, expect, it, vi } from 'vitest'
import AdminFrame from '@/features/admin/AdminFrame'
import StatTile from '@/features/admin/StatTile'
import { adminTabHref } from '@/features/admin/tabs'
import { render, tag, tags } from '../../components/static-render'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/statistics' }))

describe('admin tabs', () => {
  it('builds tab addresses that keep the period', () => {
    expect(adminTabHref('overview', 30)).toBe('/admin/statistics?days=30')
    expect(adminTabHref('users', 7)).toBe('/admin/statistics/users?days=7')
    expect(adminTabHref('checks', 90, { filter: 'urgent', shown: '100' })).toBe('/admin/statistics/checks?days=90&filter=urgent&shown=100')
  })

  it('marks the open tab, switches the period within it and says what is not counted', () => {
    const html = render(<AdminFrame tab="users" days={7}>содержимое</AdminFrame>)
    const current = tag(html, 'a', (a) => a.attrs['aria-current'] === 'page')
    expect(current.attrs.href).toBe('/admin/statistics/users?days=7')
    expect(current.text).toBe('Пользователи')
    expect(tags(html, 'a').map((a) => a.attrs.href)).toEqual(
      expect.arrayContaining(['/admin/statistics?days=7', '/admin/statistics/checks?days=7', '/admin/statistics/users?days=30', '/admin/statistics/users?days=90']),
    )
    expect(html).toContain('содержимое')
    expect(html).toContain('Удалённые аккаунты не учитываются')
  })
})

describe('a statistics tile', () => {
  it('shows growth in percent', () => {
    const html = render(<StatTile label="Проверки" value="486" change={{ kind: 'up', value: 18, unit: 'percent' }} />)
    expect(html).toContain('486')
    expect(html).toContain('▲ 18%')
  })

  it('shows a fall in percentage points', () => {
    expect(render(<StatTile label="Полезные" value="82%" change={{ kind: 'down', value: 3, unit: 'points' }} />)).toContain('▼ 3 п.п.')
  })

  it('shows a difference in pieces, new and no data', () => {
    expect(render(<StatTile label="Просьбы" value="23" change={{ kind: 'up', value: 9, unit: 'count' }} />)).toContain('▲ 9')
    expect(render(<StatTile label="x" value="5" change={{ kind: 'new' }} />)).toContain('новое')
    expect(render(<StatTile label="x" value="5" change={{ kind: 'nodata' }} />)).toContain('нет данных')
    expect(render(<StatTile label="x" value="5" change={{ kind: 'flat', value: 0, unit: 'percent' }} />)).toContain('без изменений')
  })

  it('can carry a note instead of a change', () => {
    const html = render(<StatTile label="Аккаунтов" value="1 284" note="+142 за период" />)
    expect(html).toContain('+142 за период')
    expect(html).not.toContain('нет данных')
  })
})
