import type { HealthEvent, HealthItem, HealthOverview, Pet } from '@lapka/contracts'

/**
 * The two pets of the design (spec §13) as the API returns them, on the
 * design's day, 24 September 2026: Мурка with a filled record, Бобик with
 * nothing but the pet form of an older account.
 */
export const DESIGN_TODAY = '2026-09-24'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function pet(overrides: Partial<Pet>): Pet {
  return {
    id: uuid(1),
    species: 'cat',
    name: 'Мурка',
    breed: null,
    age_years: null,
    weight_kg: null,
    sex: null,
    neutered: null,
    indoor_outdoor: null,
    diet: null,
    size_class: null,
    walk_activity: null,
    allergies: [],
    vaccinated: null,
    chronic_conditions: [],
    medications: [],
    notes: null,
    created_at: '2026-01-10T10:00:00.000Z',
    ...overrides,
  }
}

function item(n: number, targets: string[], name: string | null): HealthItem {
  return { id: uuid(n), name, targets, source_item_id: null, product_id: null, interval: null, instructions: null, medication_id: null }
}

function event(n: number, fields: Partial<HealthEvent> & Pick<HealthEvent, 'kind' | 'status' | 'date'>): HealthEvent {
  return { id: uuid(n), clinic: null, notes: null, items: [], visit_kind: null, reason: null, diagnosis: null, check_id: null, ...fields }
}

export const murka: HealthOverview = {
  pet: pet({
    breed: 'Сибирская',
    age_years: 3,
    weight_kg: 4.2,
    sex: 'female',
    neutered: true,
    vaccinated: true,
    allergies: ['Курица'],
    chronic_conditions: ['Хронический гастрит'],
    medications: ['Лечебный корм'],
  }),
  writable: ['vaccinations', 'parasites', 'visits', 'medications', 'weight'],
  weights: [
    { id: uuid(301), measured_on: '2026-09-12', weight_kg: 4.2, source: 'record' },
    { id: uuid(302), measured_on: '2026-06-20', weight_kg: 4.4, source: 'record' },
    { id: uuid(303), measured_on: '2026-03-12', weight_kg: 4.5, source: 'record' },
  ],
  events: [
    event(101, {
      kind: 'vaccination',
      status: 'done',
      date: '2026-03-12',
      clinic: 'Айболит',
      items: [item(201, ['panleukopenia', 'calicivirus', 'rhinotracheitis'], 'Нобивак Tricat Trio'), item(202, ['rabies'], 'Нобивак Rabies')],
    }),
    event(102, {
      kind: 'vaccination',
      status: 'planned',
      date: '2027-03-12',
      items: [item(203, ['panleukopenia', 'calicivirus', 'rhinotracheitis'], 'Нобивак Tricat Trio'), item(204, ['rabies'], 'Нобивак Rabies')],
    }),
    event(103, { kind: 'parasite', status: 'done', date: '2026-06-20', items: [item(205, ['fleas', 'ticks'], 'Бравекто Спот-он')] }),
    event(104, { kind: 'parasite', status: 'planned', date: '2026-09-12', items: [item(206, ['fleas', 'ticks'], 'Бравекто Спот-он')] }),
    event(105, { kind: 'parasite', status: 'done', date: '2026-07-05', items: [item(207, ['worms'], 'Мильбемакс')] }),
    event(106, { kind: 'parasite', status: 'planned', date: '2026-10-05', items: [item(208, ['worms'], 'Мильбемакс')] }),
    event(107, {
      kind: 'visit',
      status: 'done',
      date: '2026-08-02',
      clinic: 'Айболит',
      visit_kind: 'illness',
      reason: 'Рвота два дня, отказ от еды',
      diagnosis: 'Обострение гастрита',
    }),
    event(108, { kind: 'visit', status: 'planned', date: '2026-10-03', visit_kind: 'checkup', reason: 'Контрольный осмотр' }),
  ],
  medications: [
    { id: uuid(401), name: 'Лечебный корм', dosage: null, started_on: '2026-08-02', ended_on: null, ongoing: true, source: 'record' },
    { id: uuid(402), name: 'Фортифлора', dosage: '1 пакетик в день', started_on: '2026-08-02', ended_on: '2026-08-15', ongoing: false, source: 'record' },
  ],
}

/** An older account: the form's answers only, the weight with no day. */
export const bobik: HealthOverview = {
  pet: pet({ id: uuid(2), species: 'dog', name: 'Бобик', age_years: 5, weight_kg: 28, vaccinated: true }),
  writable: ['vaccinations', 'parasites', 'visits', 'medications', 'weight'],
  weights: [],
  events: [],
  medications: [],
}
