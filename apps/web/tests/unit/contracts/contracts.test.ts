import { describe, expect, it } from 'vitest'
import {
  ApiErrorEnvelopeSchema,
  CheckHistoryPageSchema,
  ERROR_CODES,
  ExtraCheckRequestStatusSchema,
  FeedbackInputSchema,
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
  capabilities: { billing: false, extra_check_request: true },
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
    expect(FeedbackInputSchema.parse({ rating: 'liked' })).toEqual({ rating: 'liked' })
    expect(() => FeedbackInputSchema.parse({ rating: 'meh' })).toThrow()
    expect(() => FeedbackInputSchema.parse({ rating: 'liked', comment: 'x'.repeat(2001) })).toThrow()
  })
})
