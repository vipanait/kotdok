import { describe, expect, it } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import { FILE_TITLE_MAX, vetSummaryPage } from '@/features/medical-record/summary/summary-view'
import { SUMMARY_TODAY, summary } from './demo-summary'

// MW-07: «Для врача» in the site's words (web v1 «summary», «dog-summary», «print»).

const TODAY = SUMMARY_TODAY

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

  it('keeps the file name within the 80 characters Safari on iOS names a PDF by, the date whole', () => {
    // The demo's long pet: Safari cut «… — медкарта — 26.09.2026» to «… — 26.09.» (MW-07, MW-09).
    const baron = 'Барон Мурлыкенштейн фон Длиннохвостов-Пушистиков Третий, главный кот третьего подъезда'
    const ru_ = vetSummaryPage(ru, 'ru', summary({}, { name: baron }), TODAY).fileTitle
    expect(ru_).toBe('Барон Мурлыкенштейн фон Длиннохвостов-Пушистиков Третий — медкарта — 26.09.2026')
    expect(ru_.length).toBeLessThanOrEqual(FILE_TITLE_MAX)
    const en_ = vetSummaryPage(en, 'en', summary({}, { name: baron }), TODAY).fileTitle
    expect(en_).toMatch(/ — medical record — 26\.09\.2026$/)
    expect(en_.length).toBeLessThanOrEqual(FILE_TITLE_MAX)
    // An emoji is never cut in half, and a cut name never ends on a space, a comma or a dot.
    const emoji = vetSummaryPage(ru, 'ru', summary({}, { name: `${'Ж'.repeat(55)}🐈 x` }), TODAY).fileTitle
    expect(emoji).toBe(`${'Ж'.repeat(55)} — медкарта — 26.09.2026`)
    // A flag is one letter to the reader: kept whole or left out, never half of it (MW-09 fix round 1).
    const flag = vetSummaryPage(ru, 'ru', summary({}, { name: `${'Ж'.repeat(53)}🇷🇺` }), TODAY).fileTitle
    expect(flag).toBe(`${'Ж'.repeat(53)} — медкарта — 26.09.2026`)
    expect(vetSummaryPage(ru, 'ru', summary({}, { name: `${'Ж'.repeat(52)}🇷🇺` }), TODAY).fileTitle).toBe(`${'Ж'.repeat(52)}🇷🇺 — медкарта — 26.09.2026`)
    // Cut at a hyphen, the name does not end on it.
    expect(vetSummaryPage(ru, 'ru', summary({}, { name: `${'А'.repeat(55)}-Пушистиков` }), TODAY).fileTitle).toBe(`${'А'.repeat(55)} — медкарта — 26.09.2026`)
    // A short name is left as it is, a hyphen at its end included.
    expect(vetSummaryPage(ru, 'ru', summary({}, { name: 'Мурка' }), TODAY).fileTitle).toBe('Мурка — медкарта — 26.09.2026')
    expect(vetSummaryPage(ru, 'ru', summary({}, { name: 'Мурка-' }), TODAY).fileTitle).toBe('Мурка- — медкарта — 26.09.2026')
  })

  it('speaks English', () => {
    const page = vetSummaryPage(en, 'en', empty, TODAY)
    expect(page.important).toEqual({ kind: 'note', text: 'Not stated by the owner' })
    expect(page.pet.weight).toBe('Weight: 28 kg, from the pet form, date not given')
  })
})
