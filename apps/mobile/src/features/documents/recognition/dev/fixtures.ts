import type { DraftEntry, RecognitionDraft, SavedRecords } from '@lapka/shared'

/*
 * TEST DATA — fixtures of the recognition screens for the developer screen
 * `pets/[id]/documents/dev-states` only (ruling R1 of the documents design
 * run). Nothing here is a recognition result and nothing here reaches real
 * users: the screen opens only when `__DEV__`, and a release bundle does not
 * even contain this file (the route requires it behind `__DEV__`). Fixed
 * values, the same as the site's preview (`apps/web/.../dev/documents-states/
 * fixtures.ts`), so both apps show the same looks. Made-up names and dates;
 * none is taken from the design mock-up.
 */

/** The states the screen lists, in the design map's order. */
export const PREVIEW_STATES = [
  'stored',
  'paid',
  'credits',
  'recognizing',
  'review',
  'edit',
  'mismatch',
  'recipe',
  'confirmed',
  'confirmed-recipe',
  'vaccination',
  'failed',
  'nothing',
  'discard',
] as const

export type PreviewState = (typeof PREVIEW_STATES)[number]

export const STATE_TITLES: Record<PreviewState, string> = {
  stored: 'Документ сохранён (предложение)',
  paid: 'Платное распознавание',
  credits: 'Не хватает проверок',
  recognizing: 'Распознавание',
  review: 'Проверка записей',
  edit: 'Правка записи',
  mismatch: 'Другая кличка',
  recipe: 'Рецепт',
  confirmed: 'Записи сохранены',
  'confirmed-recipe': 'Курс сохранён',
  vaccination: 'Прививка с источником',
  failed: 'Ошибка распознавания',
  nothing: 'Записи не найдены',
  discard: 'Отказ от записей',
}

/** The owner's day the fixtures are read on: a next date in the past is never sent. */
export const FIXTURE_TODAY = '2026-11-17'

export const FIXTURE_PET = { name: 'Тестовый питомец', species: 'cat' as const }

export const FIXTURE_PASSPORT = { id: '00000000-0000-4000-8000-00000000d0c1', title: 'Ветпаспорт (тестовые данные)', pages: 4 }
export const FIXTURE_PRESCRIPTION = { id: '00000000-0000-4000-8000-00000000d0c2', title: 'Назначение (тестовые данные)', pages: 1 }

/** What the API would say about price and balance, per state. */
export const FIXTURE_PRICES = {
  stored: { left: 2, price: 0, credits: 0 },
  paid: { left: 0, price: 1, credits: 4 },
  credits: { left: 0, price: 1, credits: 0 },
} as const

const PRODUCT_A = '00000000-0000-4000-8000-0000000000a1'
const PRODUCT_B = '00000000-0000-4000-8000-0000000000a2'
const PRODUCT_C = '00000000-0000-4000-8000-0000000000a3'
const EXISTING_RECORD = '00000000-0000-4000-8000-0000000000e1'

const passportEntries: DraftEntry[] = [
  {
    key: 'v1',
    type: 'vaccination',
    page: 2,
    date: '2026-03-12',
    name: 'Тестовая вакцина Трио',
    product_id: PRODUCT_A,
    targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'],
    next_date: '2027-03-12',
    unsure: [],
    duplicate: null,
    selected_by_default: true,
  },
  {
    key: 'v2',
    type: 'vaccination',
    page: 2,
    date: '2026-03-12',
    name: 'Тестовая вакцина от бешенства',
    product_id: PRODUCT_B,
    targets: ['rabies'],
    next_date: '2027-03-12',
    unsure: [],
    duplicate: null,
    selected_by_default: true,
  },
  {
    key: 'v3',
    type: 'vaccination',
    page: 2,
    date: null,
    name: '«Мульти…» — очень длинное название препарата, прочитанное не полностью, чтобы проверить перенос строк',
    product_id: null,
    targets: [],
    next_date: null,
    unsure: ['date', 'name'],
    duplicate: null,
    selected_by_default: false,
  },
  {
    key: 'v4',
    type: 'vaccination',
    page: 1,
    date: '2024-03-03',
    name: 'Тестовая вакцина Трио',
    product_id: PRODUCT_A,
    targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'],
    next_date: null,
    unsure: [],
    duplicate: { record_id: EXISTING_RECORD, title: 'Тестовая вакцина Трио, 3 марта 2024' },
    selected_by_default: false,
  },
  {
    key: 'p1',
    type: 'parasite',
    page: 3,
    date: '2026-11-01',
    name: 'Тестовые капли от паразитов',
    product_id: PRODUCT_C,
    targets: ['fleas', 'worms'],
    next_date: null,
    unsure: [],
    duplicate: null,
    selected_by_default: true,
  },
]

export const FIXTURE_PASSPORT_DRAFT: RecognitionDraft = {
  pet_name_as_written: FIXTURE_PET.name,
  document_date: null,
  clinic: 'Тестовая клиника',
  entries: passportEntries,
}

/** The same document, with another pet's name written in it. */
export const FIXTURE_MISMATCH_DRAFT: RecognitionDraft = { ...FIXTURE_PASSPORT_DRAFT, pet_name_as_written: 'Барсик' }

export const FIXTURE_RECIPE_DRAFT: RecognitionDraft = {
  pet_name_as_written: null,
  document_date: '2026-11-12',
  clinic: null,
  entries: [
    {
      key: 'm1',
      type: 'medication',
      page: 1,
      name: 'Тестовый препарат',
      dosage: 'По схеме в назначении (текст врача без изменений)',
      start_date: '2026-11-12',
      end_date: '2026-11-19',
      unsure: [],
      duplicate: null,
      selected_by_default: true,
    },
    {
      key: 'm2',
      type: 'medication',
      page: 1,
      name: 'Второй тестовый препарат',
      dosage: null,
      start_date: null,
      end_date: null,
      unsure: ['dosage'],
      duplicate: null,
      selected_by_default: false,
    },
  ],
}

/** What a confirm of the passport would answer: two vaccines of one day became one record. */
export const FIXTURE_SAVED_PASSPORT: SavedRecords = {
  events: [
    { kind: 'vaccination', status: 'done', items: [{}, {}] },
    { kind: 'vaccination', status: 'planned', items: [{}, {}] },
    { kind: 'parasite', status: 'done', items: [{}] },
  ],
  medications: [],
}

export const FIXTURE_SAVED_RECIPE: SavedRecords = { events: [], medications: [{}] }
