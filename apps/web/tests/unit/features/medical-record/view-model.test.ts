import { describe, expect, it } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import {
  chartGeometry,
  dueBlock,
  formatDay,
  formatRange,
  formatWeight,
  headFacts,
  importantFacts,
  sectionCards,
  weightCard,
} from '@/features/medical-record/view-model'
import { DESIGN_TODAY, bobik, murka } from './demo-overviews'

describe('Мурка: the server record (MW-01.3)', () => {
  it('heads the page with the form and the weight trend', () => {
    expect(headFacts(ru, 'ru', murka, DESIGN_TODAY)).toEqual({
      name: 'Мурка',
      meta: 'Кошка · Сибирская · 3 года · стерилизована',
      weight: '4,2 кг',
      weightNote: '−0,3 кг за 6 месяцев',
    })
  })

  it('lists the first three due dates, overdue first, and counts the rest', () => {
    const due = dueBlock(ru, 'ru', murka, DESIGN_TODAY)
    expect(due.total).toBe(5)
    expect(due.rows.map((row) => [row.title, row.status, row.tone])).toEqual([
      ['Блохи и клещи', 'Просрочено на 12 дней · 12 сентября', 'overdue'],
      ['Осмотр', 'Через 9 дней · 3 октября', 'soon'],
      ['Глисты', 'Через 11 дней · 5 октября', 'soon'],
    ])
  })

  it('shows allergies, chronic conditions and current courses', () => {
    expect(importantFacts(ru, murka, DESIGN_TODAY)).toEqual([
      { label: 'Аллергии', value: 'Курица' },
      { label: 'Хронические болезни', value: 'Хронический гастрит' },
      { label: 'Принимает сейчас', value: 'Лечебный корм · постоянно' },
    ])
  })

  it('fills every section from the server, newest first', () => {
    const cards = sectionCards(ru, murka, DESIGN_TODAY)
    const lines = Object.fromEntries(cards.map((card) => [card.section, card.lines.map((line) => `${line.title} — ${line.detail}`)]))
    expect(cards.every((card) => card.empty === null)).toBe(true)
    expect(lines).toEqual({
      vaccinations: ['Нобивак Tricat Trio — 12 марта 2026 · Айболит', 'Нобивак Rabies — 12 марта 2026 · Айболит'],
      parasites: ['Мильбемакс — 5 июля · глисты', 'Бравекто Спот-он — 20 июня · блохи и клещи'],
      visits: ['Контрольный осмотр — Запланирован · 3 октября', 'Обострение гастрита — 2 августа · Айболит'],
      medications: ['Лечебный корм — Сейчас · постоянно', 'Фортифлора — Завершён · 2–15 августа'],
    })
  })

  it('draws the weight of the year as a chart with a text alternative', () => {
    const card = weightCard(ru, murka, DESIGN_TODAY)
    expect(card.kind).toBe('chart')
    if (card.kind !== 'chart') return
    expect(card.label).toBe('График веса, от 4,5 до 4,2 кг')
    expect(card.points.map((point) => `${point.dayLabel}: ${point.label}`)).toEqual([
      '12 марта: 4,5 кг',
      '20 июня: 4,4 кг',
      '12 сентября: 4,2 кг',
    ])
  })
})

describe('Бобик: the form only, no made-up dates (MW-01.3)', () => {
  it('says the weight comes from the form, with no day', () => {
    const head = headFacts(ru, 'ru', bobik, DESIGN_TODAY)
    expect(head).toEqual({ name: 'Бобик', meta: 'Собака · 5 лет', weight: '28 кг', weightNote: 'Из анкеты, дата не указана' })
  })

  it('has no due dates and nothing to know that was not said', () => {
    expect(dueBlock(ru, 'ru', bobik, DESIGN_TODAY)).toEqual({ rows: [], total: 0 })
    expect(importantFacts(ru, bobik, DESIGN_TODAY)).toEqual([])
  })

  it('shows the form’s «привит» without a date, and «пока нет» elsewhere', () => {
    const cards = sectionCards(ru, bobik, DESIGN_TODAY)
    expect(cards.map((card) => [card.section, card.lines.length, card.empty?.title, card.empty?.detail])).toEqual([
      ['vaccinations', 0, 'В анкете: привит(а)', 'Даты и препараты не указаны'],
      ['parasites', 0, 'Пока нет записей', 'Обработки сохранятся здесь'],
      ['visits', 0, 'Пока нет записей', 'Диагнозы и назначения рядом'],
      ['medications', 0, 'Не указано владельцем', 'Курсы из анкеты появятся здесь'],
    ])
    const text = JSON.stringify(cards)
    expect(text).not.toMatch(/\d{4}/)
  })

  it('shows the form’s weight as one value, not a chart', () => {
    expect(weightCard(ru, bobik, DESIGN_TODAY)).toEqual({ kind: 'single', value: '28 кг', note: 'Из анкеты, дата не указана' })
  })

  it('reads «не привит» and «не сказано» apart', () => {
    const notVaccinated = { ...bobik, pet: { ...bobik.pet, vaccinated: false } }
    const unknown = { ...bobik, pet: { ...bobik.pet, vaccinated: null } }
    expect(sectionCards(ru, notVaccinated, DESIGN_TODAY)[0].empty?.title).toBe('В анкете: не привит(а)')
    expect(sectionCards(ru, unknown, DESIGN_TODAY)[0].empty?.title).toBe('Пока нет записей')
  })

  it('lists the form’s medicines when no course was ever made from them', () => {
    const withMeds = { ...bobik, pet: { ...bobik.pet, medications: ['Апоквел'] } }
    expect(sectionCards(ru, withMeds, DESIGN_TODAY)[3].lines).toEqual([{ key: 'form-0', title: 'Апоквел', detail: 'из анкеты' }])
    expect(importantFacts(ru, withMeds, DESIGN_TODAY)).toEqual([{ label: 'Принимает сейчас', value: 'Апоквел' }])
  })
})

describe('dates', () => {
  it('formats a calendar day without a time zone', () => {
    expect(formatDay(ru.medicalRecord, '2026-03-01', true)).toBe('1 марта 2026')
    expect(formatDay(en.medicalRecord, '2026-03-01', true)).toBe('March 1, 2026')
  })

  it('shortens a range inside one month of this year', () => {
    expect(formatRange(ru.medicalRecord, '2026-08-02', '2026-08-15', DESIGN_TODAY)).toBe('2–15 августа')
    expect(formatRange(ru.medicalRecord, '2026-07-28', '2026-08-15', DESIGN_TODAY)).toBe('28 июля – 15 августа')
    expect(formatRange(ru.medicalRecord, '2025-12-20', '2026-01-10', DESIGN_TODAY)).toBe('20 декабря 2025 – 10 января 2026')
  })

  it('names long overdue dates by the day', () => {
    const late = { ...murka, events: murka.events.map((e) => (e.date === '2026-09-12' ? { ...e, date: '2026-06-12' } : e)) }
    expect(dueBlock(ru, 'ru', late, DESIGN_TODAY).rows[0].status).toBe('Просрочено с 12 июня')
  })
})

describe('chart geometry', () => {
  function murkaChart() {
    const card = weightCard(ru, murka, DESIGN_TODAY)
    if (card.kind !== 'chart') throw new Error('expected a chart')
    return chartGeometry(card.points, 500, 150)
  }

  it('keeps every point inside the box, the lightest lowest', () => {
    const { points } = murkaChart()
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(500)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThan(150)
    }
    expect(points[2].y).toBeGreaterThan(points[0].y)
  })

  it('draws each guide at the weight its label says: the 4,4 kg point sits on the «4,4 кг» line', () => {
    const { points, guides } = murkaChart()
    // Round weights only, labelled as drawn.
    expect(guides.map((guide) => formatWeight(ru.medicalRecord, guide.value))).toEqual(['3,8 кг', '4 кг', '4,2 кг', '4,4 кг'])
    const line44 = guides.find((guide) => guide.value === 4.4)!
    const point44 = points.find((point) => point.value === 4.4)!
    expect(point44.y).toBeCloseTo(line44.y, 9)
    const line42 = guides.find((guide) => guide.value === 4.2)!
    expect(points.find((point) => point.value === 4.2)!.y).toBeCloseTo(line42.y, 9)
  })

  it('does not divide by zero when every point is the same', () => {
    const flat = chartGeometry(
      [
        { key: 'a', day: '2026-09-01', value: 4, label: '4 кг', dayLabel: '1 сентября' },
        { key: 'b', day: '2026-09-01', value: 4, label: '4 кг', dayLabel: '1 сентября' },
      ],
      500,
      150,
    )
    expect(flat.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(flat.guides.every((guide) => Number.isFinite(guide.y))).toBe(true)
  })
})
