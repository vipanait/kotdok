import { describe, expect, it } from 'vitest'
import type { VetSummary } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { vetSummaryPage } from '@/features/medical-record/summary/summary-view'

// MW-07: «Для врача» in the site's words (web v1 «summary», «dog-summary», «print»).

const TODAY = '2026-09-26'

function summary(overrides: Partial<VetSummary> = {}, pet: Partial<VetSummary['pet']> = {}): VetSummary {
  return {
    generated_on: TODAY,
    pet: {
      id: '11111111-1111-4111-8111-000000000001',
      species: 'cat',
      name: 'Мурка',
      breed: 'Сибирская',
      age_years: 3,
      weight_kg: 4.2,
      sex: 'female',
      neutered: true,
      indoor_outdoor: null,
      diet: null,
      size_class: null,
      walk_activity: null,
      allergies: ['Курица'],
      vaccinated: true,
      chronic_conditions: ['Хронический гастрит'],
      medications: ['Лечебный корм'],
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      ...pet,
    },
    weights: [
      { id: 'w3', measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' },
      { id: 'w2', measured_on: '2026-06-20', weight_kg: 4.4, source: 'record' },
      { id: 'w1', measured_on: '2026-03-12', weight_kg: 4.5, source: 'record' },
    ],
    medications: [
      { id: 'm1', name: 'Лечебный корм', dosage: 'по схеме врача', started_on: '2026-08-02', ended_on: null, ongoing: true, source: 'record' },
      { id: 'm2', name: 'Фортифлора', dosage: null, started_on: '2026-09-20', ended_on: '2026-10-03', ongoing: false, source: 'record' },
    ],
    vaccinations: [
      { target: 'panleukopenia', core: true, last_done: '2026-03-12', product: 'Нобивак Tricat Trio', next: '2027-03-12' },
      { target: 'calicivirus', core: true, last_done: null, product: null, next: null },
    ],
    parasites: [
      { group: 'fleas_ticks', last_done: '2026-06-20', product: 'Бравекто Спот-он', next: '2026-09-12' },
      { group: 'worms', last_done: '2026-07-05', product: 'Мильбемакс', next: TODAY },
    ],
    visits: [
      {
        id: '33333333-3333-4333-8333-000000000001',
        kind: 'visit',
        status: 'done',
        date: '2026-08-02',
        clinic: 'Айболит',
        notes: null,
        visit_kind: 'illness',
        reason: 'Рвота',
        diagnosis: 'Обострение хронического гастрита',
        check_id: null,
        items: [
          { id: 'i1', name: 'Фортифлора', targets: [], source_item_id: null, product_id: null, interval: null, instructions: '1 пакетик в день, 14 дней', medication_id: null },
          { id: 'i2', name: 'Лечебный корм', targets: [], source_item_id: null, product_id: null, interval: null, instructions: 'постоянно', medication_id: null },
        ],
      },
    ],
    checks: [{ id: '44444444-4444-4444-8444-000000000001', created_at: '2026-08-01T09:30:00.000Z', urgency: 'monitor', summary: 'Рвота, отказ от еды' }],
    ...overrides,
  } as VetSummary
}

const texts = (part: ReturnType<typeof vetSummaryPage>['vaccinations']) =>
  part.kind === 'table' ? part.table.rows.map((row) => row.cells.map((cell) => cell.text)) : part.text

describe('Мурка, a filled record', () => {
  const page = vetSummaryPage(ru, 'ru', summary(), TODAY)

  it('heads it with the pet as the owner described it', () => {
    expect(page).toMatchObject({
      title: 'Для врача',
      subtitle: 'Мурка · Сведения владельца',
      printTitle: 'Медкарта: Мурка',
      fileTitle: 'Мурка — медкарта — 26.09.2026',
      pet: { name: 'Мурка', meta: 'Кошка · Сибирская · 3 года · самка · стерилизована', weight: 'Вес: 4,2 кг · 12 сентября 2026' },
    })
  })

  it('says what to know, with the courses’ dosage and dates', () => {
    expect(page.important).toEqual({
      kind: 'facts',
      facts: [
        { label: 'Аллергии', text: 'Курица' },
        { label: 'Хронические болезни', text: 'Хронический гастрит' },
        { label: 'Принимает сейчас', text: 'Лечебный корм · по схеме врача, постоянно с 2 августа; Фортифлора · 20 сентября – 3 октября' },
      ],
    })
  })

  it('gives the tables full dates, overdue in words, a plan for today not overdue', () => {
    expect(texts(page.vaccinations)).toEqual([
      ['Панлейкопения', '12.03.2026', 'Нобивак Tricat Trio', '12.03.2027'],
      ['Калицивироз', 'Нет записи', '—', '—'],
    ])
    expect(texts(page.parasites)).toEqual([
      ['Блохи и клещи', '20.06.2026', 'Бравекто Спот-он', '12.09.2026 · просрочено'],
      ['Глисты', '05.07.2026', 'Мильбемакс', '26.09.2026'],
    ])
    expect(texts(page.visits)).toEqual([
      ['02.08.2026 · Болезнь · Айболит', 'Обострение хронического гастрита', 'Фортифлора — 1 пакетик в день, 14 дней; Лечебный корм — постоянно'],
    ])
    // Every cell carries its column's name: the phone layout reads it.
    expect(page.visits.kind === 'table' && page.visits.table.rows[0].cells.map((cell) => cell.label)).toEqual(['Дата / вид', 'Диагноз', 'Назначения'])
  })

  it('charts the weight and lists it newest first; checks say their level', () => {
    expect(page.weight).toMatchObject({
      kind: 'measured',
      latest: '12 сентября — 4,2 кг',
      earlier: '20 июня — 4,4 кг · 12 марта — 4,5 кг',
      chartLabel: 'График веса, от 4,5 до 4,2 кг',
    })
    expect(page.weight.kind === 'measured' && page.weight.chart?.map((point) => point.day)).toEqual(['2026-03-12', '2026-06-20', '2026-09-12'])
    expect(page.checks).toEqual([{ key: '44444444-4444-4444-8444-000000000001', day: '1 августа 2026', urgency: 'monitor', text: 'Рвота, отказ от еды' }])
    expect(page.footer).toBe('Составлено владельцем в «Лапке» 26 сентября 2026. Не является ветеринарным документом.')
  })
})

describe('a pet with the form only (web v1 «dog-summary»)', () => {
  const empty = summary(
    {
      weights: [],
      medications: [],
      vaccinations: [
        { target: 'distemper', core: true, last_done: null, product: null, next: null },
        { target: 'rabies', core: true, last_done: null, product: null, next: null },
      ],
      parasites: [
        { group: 'fleas_ticks', last_done: null, product: null, next: null },
        { group: 'worms', last_done: null, product: null, next: null },
      ],
      visits: [],
      checks: [],
    },
    { species: 'dog', name: 'Бобик', breed: null, age_years: 5, weight_kg: 28, sex: null, neutered: null, allergies: [], chronic_conditions: [], medications: [] },
  )

  it('says «не указано» or what the form says — never that the pet has nothing', () => {
    const page = vetSummaryPage(ru, 'ru', empty, TODAY)
    expect(page.pet).toEqual({ name: 'Бобик', meta: 'Собака · 5 лет', weight: 'Вес: 28 кг, из анкеты, дата не указана' })
    expect(page.important).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.vaccinations).toEqual({ kind: 'note', text: 'В анкете: привит(а). Даты и препараты не указаны.' })
    expect(page.parasites).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.visits).toEqual({ kind: 'note', text: 'Не указано владельцем' })
    expect(page.weight).toEqual({ kind: 'note', text: '28 кг · из анкеты. Дата измерения не указана.' })
    expect(page.checks).toEqual({ note: 'Пока нет проверок' })
  })

  it('names the form’s own medicines list, and an unknown vaccination as not stated', () => {
    const page = vetSummaryPage(ru, 'ru', summary({ ...empty, pet: { ...empty.pet, medications: ['Апоквел'], vaccinated: null } }), TODAY)
    expect(page.important).toMatchObject({ kind: 'facts', facts: [{ text: 'Не указано владельцем' }, { text: 'Не указано владельцем' }, { text: 'Апоквел' }] })
    expect(page.vaccinations).toEqual({ kind: 'note', text: 'Не указано владельцем' })
  })

  it('makes a safe file name of any pet name', () => {
    expect(vetSummaryPage(ru, 'ru', summary({}, { name: 'Му/р:ка?' }), TODAY).fileTitle).toBe('Мурка — медкарта — 26.09.2026')
    expect(vetSummaryPage(ru, 'ru', summary({}, { name: '...' }), TODAY).fileTitle).toBe('Питомец — медкарта — 26.09.2026')
  })

  it('speaks English', () => {
    const page = vetSummaryPage(en, 'en', empty, TODAY)
    expect(page.important).toEqual({ kind: 'note', text: 'Not stated by the owner' })
    expect(page.pet.weight).toBe('Weight: 28 kg, from the pet form, date not given')
  })
})
