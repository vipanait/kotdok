import type { CheckCaseLink, FollowupCase, FollowupCaseSummary, SymptomCheckRecord } from '@lapka/contracts'

// Cases as the API returns them, for the follow-up screens' tests.

export const PET = '11111111-1111-4111-8111-000000000001'
export const OTHER_PET = '11111111-1111-4111-8111-000000000002'
export const CASE = '22222222-2222-4222-8222-000000000001'
export const ORIGIN = '33333333-3333-4333-8333-000000000001'
export const RECHECK = '33333333-3333-4333-8333-000000000002'

export function summary(patch: Partial<FollowupCaseSummary> = {}): FollowupCaseSummary {
  return {
    id: CASE,
    pet_id: PET,
    pet_name: 'Мурка',
    pet_species: 'cat',
    origin_check_id: ORIGIN,
    origin_checked_at: '2026-10-23T06:00:00.000Z',
    origin_urgency: 'monitor',
    current_urgency: 'monitor',
    symptoms: 'Второй день ест меньше обычного',
    plan: 'watch',
    status: 'active',
    next_slot: 'mid',
    next_due_at: '2026-10-23T18:00:00.000Z',
    escalation: 'none',
    outcome: null,
    hidden_until: null,
    saved_to_record_at: null,
    checkin_count: 0,
    closed_at: null,
    created_at: '2026-10-23T06:00:00.000Z',
    ...patch,
  }
}

export function fullCase(patch: Partial<FollowupCase> = {}): FollowupCase {
  return {
    ...summary(),
    checks: [
      { check_id: ORIGIN, kind: 'origin', urgency: 'monitor', symptoms: 'Второй день ест меньше обычного', created_at: '2026-10-23T06:00:00.000Z' },
    ],
    checkins: [],
    visits: [],
    ...patch,
  }
}

export function check(id: string, createdAt: string, patch: Partial<SymptomCheckRecord> = {}): SymptomCheckRecord {
  return {
    id,
    symptoms_input: 'Ест меньше обычного',
    urgency: 'monitor',
    urgency_reason: '',
    possible_causes: [],
    species_specific_warning: null,
    home_care_steps: [],
    vet_questions: [],
    locale: 'ru',
    full_response: {},
    created_at: createdAt,
    pet_id: PET,
    pet_name: 'Мурка',
    pet_species: 'cat',
    ...patch,
  } as SymptomCheckRecord
}

export function link(patch: Partial<CheckCaseLink> = {}): CheckCaseLink {
  return { case_id: CASE, kind: 'origin', status: 'active', outcome: null, ...patch }
}
