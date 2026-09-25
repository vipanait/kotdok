import { describe, expect, it } from 'vitest'
import {
  ApiErrorEnvelopeSchema,
  CheckHistoryPageSchema,
  ERROR_CODES,
  ExtraCheckRequestStatusSchema,
  CheckFeedbackSchema,
  FeedbackInputSchema,
  HEALTH_SECTIONS,
  CompleteItemInputSchema,
  HealthEventInputSchema,
  HealthEventPatchSchema,
  VACCINE_TARGETS,
  PARASITE_TARGETS,
  HealthOverviewSchema,
  HealthOverviewReadSchema,
  DueListReadSchema,
  WeightInputSchema,
  WeightMeasurementSchema,
  WeightPatchSchema,
  PetCreateInputSchema,
  PetSchema,
  PetUpdateInputSchema,
  PublicProfileSchema,
  SymptomCheckRecordSchema,
  URGENCY_LEVELS,
} from '@lapka/contracts'

const profile = {
  id: '11111111-1111-4111-8111-000000000001',
  locale: 'ru',
  role: 'user',
  credits: 3,
  account_status: 'active',
  capabilities: { extra_check_request: true },
}

const pet = {
  id: '11111111-1111-4111-8111-000000000002',
  species: 'dog',
  name: 'Рекс',
  breed: 'labrador',
  age_years: 3,
  weight_kg: 28,
  sex: 'male',
  neutered: false,
  indoor_outdoor: null,
  diet: null,
  size_class: 'large',
  walk_activity: 'daily_long',
  allergies: [],
  vaccinated: null,
  chronic_conditions: [],
  medications: [],
  notes: null,
  created_at: '2026-05-01T10:00:00.000Z',
}

describe('public profile contract', () => {
  it('accepts the minimal profile', () => {
    expect(PublicProfileSchema.parse(profile)).toEqual(profile)
  })

  it('strips nothing and rejects Supabase internals leaking through', () => {
    const leaked = {
      ...profile,
      email: 'owner@example.com',
      aud: 'authenticated',
      app_metadata: {},
      access_token: 'secret',
    }

    expect(() => PublicProfileSchema.parse(leaked)).toThrow()
  })

  it('rejects a client trying to set its own balance shape', () => {
    expect(() => PublicProfileSchema.parse({ ...profile, credits: -1 })).toThrow()
    expect(() => PublicProfileSchema.parse({ ...profile, credits: 1.5 })).toThrow()
  })

  it('only allows the account states stage 1 defines', () => {
    expect(PublicProfileSchema.parse({ ...profile, account_status: 'deleting' }).account_status).toBe('deleting')
    expect(() => PublicProfileSchema.parse({ ...profile, account_status: 'suspended' })).toThrow()
  })
})

describe('pet contracts', () => {
  it('accepts a full pet', () => {
    expect(PetSchema.parse(pet)).toEqual(pet)
  })

  it('rejects an unknown species', () => {
    expect(() => PetSchema.parse({ ...pet, species: 'ferret' })).toThrow()
  })

  it('rejects dog-only fields on a cat', () => {
    expect(() => PetCreateInputSchema.parse({ species: 'cat', name: 'Мурка', size_class: 'large' })).toThrow()
  })

  it('does not let the client choose the owner or the id', () => {
    expect(() =>
      PetCreateInputSchema.parse({ species: 'cat', name: 'Мурка', user_id: 'someone-else' }),
    ).toThrow()
    expect(() => PetCreateInputSchema.parse({ species: 'cat', name: 'Мурка', id: 'chosen' })).toThrow()
  })

  it('requires at least one field to update', () => {
    expect(() => PetUpdateInputSchema.parse({})).toThrow()
    expect(PetUpdateInputSchema.parse({ name: 'Барсик' })).toEqual({ name: 'Барсик' })
  })

  it('rejects an empty name and one past the column limit', () => {
    expect(() => PetCreateInputSchema.parse({ species: 'cat', name: '' })).toThrow()
    expect(() => PetCreateInputSchema.parse({ species: 'cat', name: 'x'.repeat(101) })).toThrow()
  })
})

describe('symptom check contracts', () => {
  const record = {
    id: '11111111-1111-4111-8111-000000000101',
    symptoms_input: 'vomiting twice',
    urgency: 'monitor',
    urgency_reason: 'stable vitals',
    possible_causes: ['diet change'],
    species_specific_warning: null,
    home_care_steps: ['withhold food 6h'],
    vet_questions: ['when did it start?'],
    full_response: {},
    created_at: '2026-05-01T10:00:00.000Z',
    locale: 'ru',
    pet_id: '11111111-1111-4111-8111-000000000002',
    pet_name: 'Рекс',
    pet_species: 'dog',
  }

  it('accepts a stored record', () => {
    expect(SymptomCheckRecordSchema.parse(record)).toEqual(record)
  })

  it('covers every urgency level the database allows', () => {
    expect(URGENCY_LEVELS).toEqual(['emergency', 'urgent', 'monitor', 'home_care', 'healthy'])
    for (const urgency of URGENCY_LEVELS) {
      expect(SymptomCheckRecordSchema.parse({ ...record, urgency }).urgency).toBe(urgency)
    }
  })

  it('rejects an urgency the UI would not know how to render', () => {
    expect(() => SymptomCheckRecordSchema.parse({ ...record, urgency: 'critical' })).toThrow()
  })

  it('pages history with a cursor and a bounded page size', () => {
    const page = CheckHistoryPageSchema.parse({ items: [record], next_cursor: null })
    expect(page.items).toHaveLength(1)
    expect(page.next_cursor).toBeNull()
  })
})

describe('error envelope', () => {
  it('carries a code, a message and a request id', () => {
    const envelope = {
      error: { code: ERROR_CODES.not_found, message: 'gone', request_id: 'req-1' },
    }

    expect(ApiErrorEnvelopeSchema.parse(envelope)).toEqual(envelope)
  })

  it('rejects a code outside the published list', () => {
    expect(() =>
      ApiErrorEnvelopeSchema.parse({ error: { code: 'kaboom', message: 'x', request_id: 'r' } }),
    ).toThrow()
  })

  it('publishes the codes the roadmap names', () => {
    expect(Object.keys(ERROR_CODES)).toEqual(
      expect.arrayContaining([
        'bad_request',
        'unauthorized',
        'not_found',
        'insufficient_credits',
        'payload_too_large',
        'unsupported_media_type',
        'conflict',
        'rate_limited',
        'account_deleting',
        'dependency_unavailable',
        'internal_error',
      ]),
    )
  })
})

describe('remaining contracts', () => {
  it('reports extra check request status', () => {
    expect(ExtraCheckRequestStatusSchema.parse({ status: 'pending' }).status).toBe('pending')
    expect(ExtraCheckRequestStatusSchema.parse({ status: null }).status).toBeNull()
    expect(() => ExtraCheckRequestStatusSchema.parse({ status: 'granted' })).toThrow()
  })

  it('bounds feedback input', () => {
    const check_id = '11111111-1111-4111-8111-000000000101'
    expect(FeedbackInputSchema.parse({ check_id, rating: 'liked' })).toEqual({ check_id, rating: 'liked' })
    expect(() => FeedbackInputSchema.parse({ rating: 'liked' })).toThrow()
    expect(() => FeedbackInputSchema.parse({ check_id, rating: 'meh' })).toThrow()
    expect(() => FeedbackInputSchema.parse({ check_id, rating: 'liked', comment: 'x'.repeat(2001) })).toThrow()
  })

  it('reports the opinion on a check, or its absence', () => {
    expect(CheckFeedbackSchema.parse({ rating: 'disliked' }).rating).toBe('disliked')
    expect(CheckFeedbackSchema.parse({ rating: null }).rating).toBeNull()
    expect(() => CheckFeedbackSchema.parse({ rating: 'meh' })).toThrow()
  })
})

describe('medical record overview contract', () => {
  it('carries the pet form as it is and the sections the client may write to', () => {
    const overview = HealthOverviewSchema.parse({ pet, writable: [] })
    expect(overview.pet.weight_kg).toBe(28)
    // An unanswered question stays unanswered: null is not "not vaccinated".
    expect(overview.pet.vaccinated).toBeNull()
  })

  it('names the five sections of the record in their on-screen order', () => {
    expect(HEALTH_SECTIONS).toEqual(['vaccinations', 'parasites', 'visits', 'medications', 'weight'])
  })

  it('rejects a section the client would not know how to show', () => {
    expect(HealthOverviewSchema.safeParse({ pet, writable: ['files'] }).success).toBe(false)
  })

  it('still reads an overview that a later server has added fields to', () => {
    // A published app cannot be updated everywhere at once, and every medical
    // record stage adds to this response. An older client ignores what it does
    // not know instead of failing the whole screen.
    const later = HealthOverviewSchema.parse({ pet, writable: ['weight'], weights: [], visits: [] })
    expect(later).toEqual({ pet, writable: ['weight'], weights: [], events: [] })
  })
})

describe('weight contracts', () => {
  const measurement = {
    id: '11111111-1111-4111-8111-00000000000a',
    measured_on: '2026-09-12',
    weight_kg: 4.2,
    source: 'record',
  }

  it('accepts a dated measurement and the form’s undated one', () => {
    expect(WeightMeasurementSchema.parse(measurement)).toEqual(measurement)
    expect(WeightMeasurementSchema.safeParse({ ...measurement, measured_on: null, source: 'form' }).success).toBe(true)
  })

  it('carries a calendar day, not a moment', () => {
    expect(WeightInputSchema.safeParse({ measured_on: '2026-09-12T10:00:00Z', weight_kg: 4.2 }).success).toBe(false)
    expect(WeightInputSchema.safeParse({ measured_on: '2026-02-30', weight_kg: 4.2 }).success).toBe(false)
  })

  it('refuses zero, a negative weight, over 200 and a non-number (MR-02.1)', () => {
    for (const weight_kg of [0, -1, 200.1, '4,2', Number.NaN]) {
      expect(WeightInputSchema.safeParse({ measured_on: '2026-09-12', weight_kg }).success, String(weight_kg)).toBe(false)
    }
    expect(WeightInputSchema.safeParse({ measured_on: '2026-09-12', weight_kg: 200 }).success).toBe(true)
  })

  it('does not take a weighing day alone as a change to the pet (review M5)', () => {
    expect(PetUpdateInputSchema.safeParse({ weight_measured_on: '2026-09-25' }).success).toBe(false)
    expect(PetUpdateInputSchema.safeParse({ weight_kg: 4, weight_measured_on: '2026-09-25' }).success).toBe(true)
  })

  it('needs something to change and never un-dates a measurement', () => {
    expect(WeightPatchSchema.safeParse({}).success).toBe(false)
    expect(WeightPatchSchema.safeParse({ measured_on: null }).success).toBe(false)
    expect(WeightPatchSchema.safeParse({ weight_kg: 4.3 }).success).toBe(true)
  })

  it('reads an overview from a server that has no weights yet as an empty history', () => {
    expect(HealthOverviewSchema.parse({ pet, writable: [] }).weights).toEqual([])
  })
})

describe('vaccination contracts', () => {
  const two = {
    kind: 'vaccination',
    status: 'done',
    date: '2026-09-24',
    items: [
      { name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'], next_on: '2027-09-24' },
      { name: 'Нобивак Rabies', targets: ['rabies'], next_on: '2027-09-24' },
    ],
  }

  it('takes several vaccines in one record, each with its own next day', () => {
    expect(HealthEventInputSchema.parse(two).items).toHaveLength(2)
  })

  it('takes a vaccine with no name but the diseases, and refuses one with neither', () => {
    expect(HealthEventInputSchema.safeParse({ ...two, items: [{ name: null, targets: ['rabies'] }] }).success).toBe(true)
    expect(HealthEventInputSchema.safeParse({ ...two, items: [{ name: '', targets: [] }] }).success).toBe(false)
    expect(HealthEventInputSchema.safeParse({ ...two, items: [] }).success).toBe(false)
  })

  it('refuses a next day that is not after the record, and a next day on a plan', () => {
    expect(HealthEventInputSchema.safeParse({ ...two, items: [{ targets: ['rabies'], next_on: '2026-09-24' }] }).success).toBe(false)
    expect(
      HealthEventInputSchema.safeParse({ ...two, status: 'planned', items: [{ targets: ['rabies'], next_on: '2027-09-24' }] }).success,
    ).toBe(false)
  })

  it('refuses a disease it does not know', () => {
    expect(HealthEventInputSchema.safeParse({ ...two, items: [{ targets: ['flu'] }] }).success).toBe(false)
  })

  it('names the core vaccinations for each species', () => {
    const core = (species: 'cat' | 'dog') =>
      VACCINE_TARGETS.filter((t) => t.core && (t.species as readonly string[]).includes(species)).map((t) => t.code)
    expect(core('cat')).toEqual(['panleukopenia', 'calicivirus', 'rhinotracheitis', 'rabies'])
    expect(core('dog')).toEqual(['distemper', 'parvovirus', 'adenovirus', 'rabies'])
  })

  it('needs something to change in a correction', () => {
    expect(HealthEventPatchSchema.safeParse({}).success).toBe(false)
    expect(HealthEventPatchSchema.safeParse({ date: '2027-03-20' }).success).toBe(true)
  })

  it('marks a plan done on a day, with or without the next one', () => {
    expect(CompleteItemInputSchema.safeParse({ done_on: '2026-09-25', next_on: null }).success).toBe(true)
    expect(CompleteItemInputSchema.safeParse({ done_on: '2026-09-25', next_on: '2026-09-25' }).success).toBe(false)
  })
})

describe('parasite treatment contracts', () => {
  const treatment = {
    kind: 'parasite',
    status: 'done',
    date: '2026-09-24',
    items: [
      { name: 'Бравекто Спот-он', targets: ['fleas', 'ticks'], next_on: '2026-12-17' },
      { name: 'Мильбемакс', targets: ['worms'], next_on: '2026-12-24' },
    ],
  }

  it('takes a treatment with several products and their own next dates', () => {
    expect(HealthEventInputSchema.safeParse(treatment).success).toBe(true)
  })

  it('keeps diseases and parasites apart', () => {
    expect(HealthEventInputSchema.safeParse({ ...treatment, items: [{ targets: ['rabies'] }] }).success).toBe(false)
    expect(
      HealthEventInputSchema.safeParse({ kind: 'vaccination', status: 'done', date: '2026-09-24', items: [{ targets: ['fleas'] }] }).success,
    ).toBe(false)
  })

  it('groups ear mites with ticks and heartworm with worms', () => {
    const group = (code: string) => PARASITE_TARGETS.find((target) => target.code === code)?.group
    expect([group('ear_mites'), group('heartworm'), group('fleas')]).toEqual(['ticks', 'worms', 'fleas'])
  })
})

describe('reading records of a kind this app does not know yet', () => {
  const vaccination = {
    id: '11111111-1111-4111-8111-0000000000e1', kind: 'vaccination', status: 'done', date: '2026-03-12',
    clinic: null, notes: null, items: [{ id: '11111111-1111-4111-8111-0000000000f1', name: null, targets: ['rabies'], source_item_id: null }],
  }
  const future = { ...vaccination, id: '11111111-1111-4111-8111-0000000000e2', kind: 'grooming' }

  it('drops them from the overview instead of failing the whole record', () => {
    const read = HealthOverviewReadSchema.parse({ pet, writable: [], weights: [], events: [vaccination, future] })
    expect(read.events.map((event) => event.id)).toEqual([vaccination.id])
  })

  it('keeps a known record that a later server added a field to (review 1)', () => {
    const read = HealthOverviewReadSchema.parse({ pet, writable: [], weights: [], events: [{ ...vaccination, visit_id: null }] })
    expect(read.events.map((event) => event.id)).toEqual([vaccination.id])
  })

  it('fails loudly on a known record that is broken, rather than hiding it (review 1)', () => {
    expect(() => HealthOverviewReadSchema.parse({ pet, writable: [], weights: [], events: [{ ...vaccination, date: 'soon' }] })).toThrow()
  })

  it('drops them from the due list', () => {
    const row = { pet_id: pet.id, event_id: vaccination.id, item_id: vaccination.items[0].id, kind: 'vaccination', date: '2027-03-12', name: null, targets: ['rabies'] }
    expect(DueListReadSchema.parse([row, { ...row, kind: 'grooming' }])).toHaveLength(1)
  })
})
