import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { cssString } from '@lapka/shared'
import { summaryHtml } from './summary-html'
import type { SummaryView } from './summary-view'

function view(overrides: Partial<SummaryView> = {}): SummaryView {
  return {
    title: 'Медкарта: Мурка',
    petName: 'Мурка',
    pet: { lines: ['Кошка · Сибирская · 3 года', 'Стерилизована', '4,2 кг · 12 сентября'] },
    important: [{ label: 'Аллергии', value: 'курица' }],
    vaccinations: [['Бешенство', '12 марта 2025', '—', 'Просрочено с 12 марта']],
    parasites: [['Глисты', 'Нет записей', '—', '—']],
    visits: [['2 августа', 'Болезнь', 'Обострение гастрита', 'Фортифлора — 1 пакетик']],
    weights: [['12 сентября', '4,2 кг']],
    chart: [
      { day: '2026-03-12', kg: 4.5, label: '4,5 кг' },
      { day: '2026-09-12', kg: 4.2, label: '4,2 кг' },
    ],
    checks: [['1 августа', 'СРОЧНО', 'Рвота два дня']],
    footer: 'Составлено владельцем в приложении «Лапка» 24 сентября 2026. Не является ветеринарным документом.',
    ...overrides,
  }
}

describe('the PDF page (MR-09.2, MR-09.3)', () => {
  it('escapes everything the owner typed', () => {
    const html = summaryHtml(
      ru,
      view({
        title: 'Медкарта: <img src=x onerror=alert(1)>',
        petName: '"><script>alert(1)</script>',
        visits: [['2 августа', 'Болезнь', '<script>alert("x")</script> & «гастрит»', "O'Neil"]],
        checks: [['1 августа', 'СРОЧНО', '</td></tr></table><b>']],
      }),
    )
    // One script: the page layout, which carries none of the owner's text.
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('</td></tr></table><b>')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; «гастрит»')
    expect(html).toContain('O&#39;Neil')
  })

  it('keeps Cyrillic as text in UTF-8 and loads nothing from outside', () => {
    const html = summaryHtml(ru, view())
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('Обострение гастрита')
    expect(html).not.toMatch(/(src|href)=["']?(https?:|\/\/)/)
    expect(html).not.toContain('@import')
  })

  it('repeats table headings on every page, wraps long text, and puts the footer on each page', () => {
    const html = summaryHtml(ru, view({ visits: [['2 августа', 'Болезнь', 'Д'.repeat(2000), '—']] }))
    expect(html).toContain('<thead>')
    expect(html).toMatch(/thead\s*\{[^}]*display:\s*table-header-group/)
    expect(html).toMatch(/overflow-wrap:\s*anywhere/)
    expect(html).toMatch(/tr\s*\{[^}]*break-inside:\s*avoid/)
    // Laid out on A4 pages in the print view: headings cloned onto a new page, footer with the page number on each.
    expect(html).toContain("tHead.cloneNode(true)")
    expect(html).toContain('data-footer="Составлено владельцем в приложении «Лапка» 24 сентября 2026. Не является ветеринарным документом."')
    expect(html).toContain('data-page="Стр."')
  })

  it('draws the weight as a line with signed points, and says urgency and overdue in words', () => {
    const html = summaryHtml(ru, view())
    expect(html).toContain('<polyline')
    expect(html).toContain('4,5 кг')
    expect(html).toContain('СРОЧНО')
    expect(html).toContain('Просрочено с 12 марта')
  })

  it('shows «Не указано владельцем»-style empties instead of empty tables', () => {
    const html = summaryHtml(ru, view({ visits: [], weights: [], chart: [], checks: [] }))
    expect(html).toContain('Визитов за год не записано')
    expect(html).toContain('Измерений нет')
    expect(html).toContain('Проверок не было')
    expect(html).not.toContain('<polyline')
  })
})

describe('printing without the page script (Android) or with a row taller than a page', () => {
  it('keeps page margins, the footer and page numbers in the margin boxes', () => {
    const html = summaryHtml(ru, view())
    expect(html).toMatch(/@page\s*\{[^@]*margin:\s*48px 53px 76px/)
    expect(html).toContain('@bottom-left { content: "Составлено владельцем в приложении «Лапка» 24 сентября 2026. Не является ветеринарным документом."')
    expect(html).toContain('@bottom-right { content: "Стр." " " counter(page) " / " counter(pages)')
    // The laid-out pages bring their own margins; the flowing layout falls back whole.
    expect(html).toContain("'@page { margin: 0; }")
    expect(html).toContain('replaceChild(backup, flow)')
  })

  it('writes text into CSS so it cannot end the string or the style block', () => {
    expect(cssString('a"b\\c\n</style>')).toBe('"a\\"b\\\\c \\3C /style>"')
  })
})

