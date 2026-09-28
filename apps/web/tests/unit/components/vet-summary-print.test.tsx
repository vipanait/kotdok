import { describe, expect, it, vi } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { SummaryActions, VetSummaryView, applyFileTitle } from '@/features/medical-record/summary/VetSummaryScreen'
import { vetSummaryPage } from '@/features/medical-record/summary/summary-view'
import { SUMMARY_TODAY, summary } from '../features/medical-record/demo-summary'
import { elements, render, tag, tags } from './static-render'

// «Для врача» and its print (MW-07, MW-09): both buttons open the browser's
// print dialog, the page is titled by the file name while it is open, and
// what goes on paper — the heading, the disclaimer in the flow, the page
// footer rule — is on the page.

const words = ru.medicalRecord.vetSummary

describe('the print buttons', () => {
  it('both open the print dialog; «Сохранить PDF» is described by the hint on how', () => {
    const onPrint = vi.fn()
    const tree = elements(SummaryActions({ words, onPrint }))
    const buttons = tree.filter((el) => el.type === 'button')
    expect(buttons.map((button) => [button.props.type, button.props.children])).toEqual([
      ['button', words.print],
      ['button', words.savePdf],
    ])
    for (const button of buttons) (button.props.onClick as () => void)()
    expect(onPrint).toHaveBeenCalledTimes(2)
    const hint = tree.find((el) => el.props.id === buttons[1].props['aria-describedby'])
    expect(hint?.props.children).toBe(words.pdfHint)
    // One named group: a screen reader hears what the two buttons are for.
    expect(tree[0].props).toMatchObject({ role: 'group', 'aria-label': words.actionsLabel })
  })
})

describe('the summary as drawn and printed', () => {
  const page = vetSummaryPage(ru, 'ru', summary(), SUMMARY_TODAY)
  const html = render(<VetSummaryView page={page} dict={ru} onPrint={() => {}} />)

  it('has the head with the buttons, and the print head with the disclaimer in the flow', () => {
    expect(tags(html, 'h1').map((h) => h.text)).toEqual([page.title])
    expect(tags(html, 'button').map((button) => button.text)).toEqual([words.print, words.savePdf])
    expect(tag(html, 'p', (p) => p.attrs.class === 'vet-print-title').text).toBe('Медкарта: Мурка')
    // Printed whatever the browser does with page margins («Поля: нет», Safari).
    expect(tag(html, 'p', (p) => p.attrs.class === 'vet-print-note').text).toBe(page.footer)
    expect(page.footer).toContain('Не является ветеринарным документом')
  })

  it('writes the page rule for A4 with the footer and «Страница N из M» in the margins', () => {
    const style = tags(html, 'style')
    expect(style).toHaveLength(1)
    expect(style[0].text).toContain('size: A4')
    expect(style[0].text).toContain('@bottom-left { content: "Составлено владельцем')
    expect(style[0].text).toContain('counter(page)')
    expect(style[0].text).toContain('counter(pages)')
  })

  it('names every part for a screen reader, and heads the first row of the visits for Safari’s print', () => {
    for (const id of ['vet-pet-name', 'vet-important-title', 'vet-vaccinations-title', 'vet-parasites-title', 'vet-visits-title', 'vet-weight-title', 'vet-checks-title']) {
      expect(tag(html, 'section', (section) => section.attrs['aria-labelledby'] === id)).toBeTruthy()
    }
    expect(tags(html, 'tr').filter((row) => row.attrs['data-heading']).map((row) => row.attrs['data-heading'])).toEqual([words.visits])
  })

  it('in English too', () => {
    const english = vetSummaryPage(en, 'en', summary(), SUMMARY_TODAY)
    const markup = render(<VetSummaryView page={english} dict={en} onPrint={() => {}} />, 'en')
    expect(tags(markup, 'button').map((button) => button.text)).toEqual([en.medicalRecord.vetSummary.print, en.medicalRecord.vetSummary.savePdf])
  })
})

describe('the page title while the summary is open', () => {
  const page = vetSummaryPage(ru, 'ru', summary(), SUMMARY_TODAY)

  it('is the file name «Сохранить как PDF» offers, and the site’s title comes back after', () => {
    const doc = { title: 'Лапка' }
    const restore = applyFileTitle(doc, page.fileTitle)
    expect(doc.title).toBe('Мурка — медкарта — 26.09.2026')
    restore()
    expect(doc.title).toBe('Лапка')
  })

  it('is left alone when the next page already set its own', () => {
    const doc = { title: 'Лапка' }
    const restore = applyFileTitle(doc, page.fileTitle)
    doc.title = 'Медкарта — Лапка'
    restore()
    expect(doc.title).toBe('Медкарта — Лапка')
  })
})
