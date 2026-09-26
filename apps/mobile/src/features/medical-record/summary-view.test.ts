import { describe, expect, it } from 'vitest'
import type { VetSummary } from '@lapka/contracts'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { summaryFileName, summaryView } from './summary-view'

const TODAY = '2026-09-24'

function pet(overrides: Partial<VetSummary['pet']> = {}): VetSummary['pet'] {
  return {
    id: '11111111-1111-4111-8111-000000000001',
    name: 'Мурка',
    species: 'cat',
    breed: 'Сибирская',
    age_years: 3,
    weight_kg: 4.2,
    sex: 'female',
    neutered: true,
    allergies: ['курица'],
    chronic_conditions: ['хронический гастрит'],
    medications: ['Лечебный корм'],
    vaccinated: true,
    size_class: null,
    walk_activity: null,
    diet: null,
    lifestyle: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as VetSummary['pet']
}

function summary(overrides: Partial<VetSummary> = {}): VetSummary {
  return {
    generated_on: TODAY,
    pet: pet(),
    weights: [
      { id: 'w2', measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' },
      { id: 'w1', measured_on: '2026-03-12', weight_kg: 4.5, source: 'record' },
    ],
    medications: [
      { id: 'm1', name: 'Лечебный корм', dosage: 'По схеме врача', started_on: '2026-08-02', ended_on: null, ongoing: true, source: 'record', visit_item_id: null },
    ],
    vaccinations: [
      { target: 'panleukopenia', core: true, last_done: '2026-03-12', product: 'Нобивак Tricat Trio', next: '2027-03-12' },
      { target: 'rabies', core: true, last_done: '2025-03-12', product: null, next: '2026-03-12' },
      { target: 'calicivirus', core: true, last_done: null, product: null, next: null },
    ],
    parasites: [
      { group: 'fleas_ticks', last_done: '2026-06-20', product: 'Бравекто', next: '2026-09-12' },
      { group: 'worms', last_done: null, product: null, next: null },
    ],
    visits: [
      {
        id: 'v1', kind: 'visit', status: 'done', date: '2026-08-02', clinic: 'Айболит', notes: null, visit_kind: 'illness',
        reason: 'Рвота', diagnosis: 'Обострение гастрита', check_id: null,
        items: [
          { id: 'i1', name: 'Фортифлора', targets: [], source_item_id: null, product_id: null, interval: null, instructions: '1 пакетик', medication_id: null },
          { id: 'i2', name: 'Лечебный корм', targets: [], source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null },
        ],
      },
    ],
    checks: [{ id: 'c1', created_at: '2026-08-01T10:00:00.000Z', urgency: 'urgent', summary: 'Рвота два дня' }],
    ...overrides,
  } as VetSummary
}

describe('the summary for the vet, as shown and printed (MR-09.1)', () => {
  it('has every section, with overdue said in words', () => {
    const view = summaryView(ru, summary(), TODAY)
    expect(view.title).toBe('Медкарта: Мурка')
    expect(view.pet.lines).toEqual(['Кошка · Сибирская · 3 года', 'Стерилизована', '4,2 кг · 12 сентября'])
    expect(view.important).toEqual([
      { label: 'Аллергии', value: 'курица' },
      { label: 'Хронические болезни', value: 'хронический гастрит' },
      { label: 'Принимает сейчас', value: 'Лечебный корм — По схеме врача' },
    ])
    expect(view.vaccinations).toEqual([
      ['Панлейкопения', '12 марта', 'Нобивак Tricat Trio', '12 марта 2027'],
      ['Бешенство', '12 марта 2025', '—', 'Просрочено с 12 марта'],
      ['Калицивироз', 'Нет записей', '—', '—'],
    ])
    expect(view.parasites).toEqual([
      ['Блохи и клещи', '20 июня', 'Бравекто', 'Просрочено с 12 сентября'],
      ['Глисты', 'Нет записей', '—', '—'],
    ])
    expect(view.visits).toEqual([['2 августа', 'Болезнь', 'Обострение гастрита', 'Фортифлора — 1 пакетик; Лечебный корм']])
    expect(view.weights).toEqual([
      ['12 сентября', '4,2 кг'],
      ['12 марта', '4,5 кг'],
    ])
    expect(view.checks).toEqual([['1 августа', 'СРОЧНО', 'Рвота два дня']])
    expect(view.footer).toBe('Составлено владельцем в приложении «Лапка» 24 сентября 2026. Не является ветеринарным документом.')
  })

  it('says «Не указано владельцем» for what is empty, never «нет»', () => {
    const empty = summaryView(
      ru,
      summary({
        pet: pet({ name: 'Рекс', species: 'dog', sex: null, breed: null, age_years: null, neutered: null, weight_kg: null, allergies: [], chronic_conditions: [], medications: [] }),
        weights: [],
        medications: [],
        visits: [],
        checks: [],
      }),
      TODAY,
    )
    expect(empty.pet.lines).toEqual(['Собака', 'Вес: Не указано владельцем'])
    expect(empty.important).toEqual([
      { label: 'Аллергии', value: 'Не указано владельцем' },
      { label: 'Хронические болезни', value: 'Не указано владельцем' },
      { label: 'Принимает сейчас', value: 'Не указано владельцем' },
    ])
    expect(empty.visits).toEqual([])
    expect(empty.weights).toEqual([])
    expect(empty.checks).toEqual([])
  })

  it('uses the form’s weight without a date when nothing is measured', () => {
    expect(summaryView(ru, summary({ weights: [] }), TODAY).pet.lines.at(-1)).toBe('4,2 кг — из анкеты, без даты')
  })

  it('takes the medicines from the form when there are no courses', () => {
    const view = summaryView(ru, summary({ medications: [] }), TODAY)
    expect(view.important.at(-1)).toEqual({ label: 'Принимает сейчас', value: 'Лечебный корм' })
  })

  it('speaks English', () => {
    const view = summaryView(en, summary(), TODAY)
    expect(view.title).toBe('Medical record: Мурка')
    expect(view.vaccinations[2]).toEqual(['Calicivirus', 'No records', '—', '—'])
  })
})

describe('the file name (MR-09.2)', () => {
  it('is the pet’s name and the day, without characters a file system refuses', () => {
    expect(summaryFileName(ru, 'Мурка', TODAY)).toBe('Мурка — медкарта — 24.09.2026.pdf')
    expect(summaryFileName(ru, 'Му/р:ка*?<>|"\\', TODAY)).toBe('Мурка — медкарта — 24.09.2026.pdf')
    expect(summaryFileName(ru, '../../etc', TODAY)).toBe('etc — медкарта — 24.09.2026.pdf')
    expect(summaryFileName(ru, '   ', TODAY)).toBe('Питомец — медкарта — 24.09.2026.pdf')
    expect(summaryFileName(ru, 'Ж'.repeat(200), TODAY)).toBe(`${'Ж'.repeat(60)} — медкарта — 24.09.2026.pdf`)
    // Direction and zero-width marks could make a name read as something else.
    expect(summaryFileName(ru, 'Му\u202Eрка\u200B', TODAY)).toBe('Мурка — медкарта — 24.09.2026.pdf')
    // An emoji is not cut in half at the length limit.
    expect(summaryFileName(ru, `${'Ж'.repeat(59)}🐱🐱`, TODAY)).toBe(`${'Ж'.repeat(59)}🐱 — медкарта — 24.09.2026.pdf`)
    expect(summaryFileName(ru, 'Мурка...  ', TODAY)).toBe('Мурка — медкарта — 24.09.2026.pdf')
  })
})
