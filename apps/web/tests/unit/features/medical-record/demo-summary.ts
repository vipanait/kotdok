import type { VetSummary } from '@lapka/contracts'

/** The day the summary fixture is read on. */
export const SUMMARY_TODAY = '2026-09-26'
const TODAY = SUMMARY_TODAY

/** «Мурка», a filled record, as GET /health/summary answers (MW-07). */
export function summary(overrides: Partial<VetSummary> = {}, pet: Partial<VetSummary['pet']> = {}): VetSummary {
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
