import { describe, expect, it, vi } from 'vitest'
import { ApiError, ApiTimeoutError, type ApiClient } from '@lapka/shared'
import {
  classifyFailure,
  fetchRecord,
  initialRecordState,
  recordReducer,
  type RecordData,
  type RecordState,
} from '@/features/medical-record/record-load'
import {
  MEDICAL_RECORD_STAGE,
  addableRecordTypes,
  parseRecordType,
  sectionOpen,
  type MedicalRecordStage,
} from '@/features/medical-record/stage'
import { murka } from './demo-overviews'

const data: RecordData = { overview: murka, checks: { status: 'ready', items: [] } }

describe('loading states (MW-01.5)', () => {
  it('starts with a skeleton, or with what this tab saw before', () => {
    expect(initialRecordState(null)).toEqual({ status: 'loading' })
    expect(initialRecordState(data)).toEqual({ status: 'ready', data, refreshing: true, stale: false })
  })

  it('turns a failed first load into an error with a retry, never an empty record', () => {
    const state = recordReducer({ status: 'loading' }, { type: 'failed', failure: 'failed' })
    expect(state).toEqual({ status: 'failed', retrying: false })
    expect(recordReducer(state, { type: 'start' })).toEqual({ status: 'failed', retrying: true })
    // A retry that fails again leaves the retry usable.
    expect(recordReducer({ status: 'failed', retrying: true }, { type: 'failed', failure: 'failed' })).toEqual({
      status: 'failed',
      retrying: false,
    })
  })

  it('keeps the data it had when a refresh fails, marked as old', () => {
    const shown: RecordState = { status: 'ready', data, refreshing: true, stale: false }
    expect(recordReducer(shown, { type: 'failed', failure: 'failed' })).toEqual({ status: 'ready', data, refreshing: false, stale: true })
    const fresh = recordReducer({ status: 'ready', data, refreshing: true, stale: true }, { type: 'loaded', data })
    expect(fresh).toEqual({ status: 'ready', data, refreshing: false, stale: false })
  })

  it('drops the data on a refusal or an ended session (MW-01.2)', () => {
    const shown: RecordState = { status: 'ready', data, refreshing: true, stale: false }
    expect(recordReducer(shown, { type: 'failed', failure: 'not_found' })).toEqual({ status: 'not_found' })
    expect(recordReducer(shown, { type: 'failed', failure: 'signed_out' })).toEqual({ status: 'signed_out' })
  })

  it('reads the API errors', () => {
    expect(classifyFailure(new ApiError('not_found', 404, 'No such resource'))).toBe('not_found')
    expect(classifyFailure(new ApiError('unauthorized', 401, 'no token'))).toBe('signed_out')
    expect(classifyFailure(new ApiError('account_deleting', 403, 'deleting'))).toBe('deleting')
    expect(classifyFailure(new ApiError('internal_error', 500, 'boom'))).toBe('failed')
    expect(classifyFailure(new ApiTimeoutError('/pets/x/health', 30_000))).toBe('failed')
    expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('failed')
  })
})

describe('fetching the record', () => {
  function api(overview: () => Promise<unknown>, checks: () => Promise<unknown>) {
    return { getHealthOverview: vi.fn(overview), listChecks: vi.fn(checks) } as unknown as ApiClient
  }

  it('asks for the record and this pet’s latest checks', async () => {
    const client = api(async () => murka, async () => ({ items: [], next_cursor: null }))
    await expect(fetchRecord(client, murka.pet.id)).resolves.toEqual(data)
    expect(client.getHealthOverview).toHaveBeenCalledWith(murka.pet.id)
    expect(client.listChecks).toHaveBeenCalledWith({ pet_id: murka.pet.id, limit: 3 })
  })

  it('fails when the record fails, whatever the history did', async () => {
    const error = new ApiError('internal_error', 500, 'boom')
    const client = api(async () => Promise.reject(error), async () => ({ items: [], next_cursor: null }))
    await expect(fetchRecord(client, murka.pet.id)).rejects.toBe(error)
  })

  it('shows the record when only the history failed', async () => {
    const client = api(async () => murka, async () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(fetchRecord(client, murka.pet.id)).resolves.toEqual({ overview: murka, checks: { status: 'failed' } })
  })

  it('closes the page when the history is refused for the session', async () => {
    const refused = new ApiError('unauthorized', 401, 'no token')
    const client = api(async () => murka, async () => Promise.reject(refused))
    await expect(fetchRecord(client, murka.pet.id)).rejects.toBe(refused)
  })
})

describe('stage flags', () => {
  const none: MedicalRecordStage = {
    weight: false,
    vaccinations: false,
    parasites: false,
    due: false,
    medications: false,
    visits: false,
    vetSummary: false,
  }

  it('offers nothing to add while no form is built', () => {
    expect(addableRecordTypes(murka.writable, none)).toEqual([])
  })

  it('offers every record type and the summary for the vet once MW-07 is on', () => {
    expect(MEDICAL_RECORD_STAGE.weight).toBe(true)
    expect(MEDICAL_RECORD_STAGE.vaccinations).toBe(true)
    expect(MEDICAL_RECORD_STAGE.parasites).toBe(true)
    expect(MEDICAL_RECORD_STAGE.due).toBe(true)
    expect(MEDICAL_RECORD_STAGE.medications).toBe(true)
    expect(MEDICAL_RECORD_STAGE.visits).toBe(true)
    expect(MEDICAL_RECORD_STAGE.vetSummary).toBe(true)
    expect(addableRecordTypes(murka.writable)).toEqual(['vaccination', 'parasite', 'visit', 'medication', 'weight'])
  })

  it('reads ?type= strictly', () => {
    expect(parseRecordType('weight')).toBe('weight')
    expect(parseRecordType('Weight')).toBeNull()
    expect(parseRecordType(['weight', 'weight'])).toBeNull()
    expect(parseRecordType(undefined)).toBeNull()
  })

  it('opens a section only when it is built and the server can store it', () => {
    const weight = { ...none, weight: true }
    expect(addableRecordTypes(['weight'], weight)).toEqual(['weight'])
    expect(addableRecordTypes(['vaccinations'], weight)).toEqual([])
    expect(sectionOpen('weight', ['vaccinations'], weight)).toBe(false)
    expect(sectionOpen('weight', null, weight)).toBe(true)
  })
})
