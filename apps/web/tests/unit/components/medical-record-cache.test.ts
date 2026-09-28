import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VetSummary } from '@lapka/contracts'
import { ApiError, type ApiClient } from '@lapka/shared'
import { loadRecord, loadStep, recordCache, type RecordData } from '@/features/medical-record/record-load'
import { bobik, murka } from '../features/medical-record/demo-overviews'

// The medical record's hook (`useMedicalRecord`) and the summary's
// (`useVetSummary`) load through `loadStep`: what the tab keeps of a record
// must not outlive the right to see it (MW-01), and an answer the page no
// longer wants never lands.

const TODAY = '2026-09-27'
const kept = (overview: typeof murka): RecordData => ({ overview, checks: { status: 'ready', items: [] } })

function api(overview: () => Promise<unknown>) {
  return {
    getHealthOverview: vi.fn(overview),
    listChecks: vi.fn(async () => ({ items: [], next_cursor: null })),
  } as unknown as ApiClient
}

afterEach(() => recordCache.clear())

describe('the medical record’s cache as the hook keeps it', () => {
  it('keeps a fresh record for the next visit to the page, on the owner’s day', async () => {
    const client = api(async () => murka)
    await expect(loadRecord(client, murka.pet.id, TODAY, () => true)).resolves.toEqual({ type: 'loaded', data: kept(murka) })
    expect(client.getHealthOverview).toHaveBeenCalledWith(murka.pet.id, TODAY)
    expect(recordCache.get(murka.pet.id)).toEqual(kept(murka))
  })

  it('forgets every pet’s record when the session is gone (401)', async () => {
    recordCache.set(murka.pet.id, kept(murka))
    recordCache.set(bobik.pet.id, kept(bobik))
    const action = await loadRecord(api(async () => Promise.reject(new ApiError('unauthorized', 401, 'expired'))), murka.pet.id, TODAY, () => true)
    expect(action).toEqual({ type: 'failed', failure: 'signed_out' })
    expect([recordCache.get(murka.pet.id), recordCache.get(bobik.pet.id)]).toEqual([null, null])
  })

  it('forgets every pet’s record when the account is closing', async () => {
    recordCache.set(bobik.pet.id, kept(bobik))
    const action = await loadRecord(api(async () => Promise.reject(new ApiError('account_deleting', 403, 'deleting'))), murka.pet.id, TODAY, () => true)
    expect(action).toEqual({ type: 'failed', failure: 'deleting' })
    expect(recordCache.get(bobik.pet.id)).toBeNull()
  })

  it('forgets only this pet’s record when it is not there any more (404)', async () => {
    recordCache.set(murka.pet.id, kept(murka))
    recordCache.set(bobik.pet.id, kept(bobik))
    const action = await loadRecord(api(async () => Promise.reject(new ApiError('not_found', 404, 'gone'))), murka.pet.id, TODAY, () => true)
    expect(action).toEqual({ type: 'failed', failure: 'not_found' })
    expect(recordCache.get(murka.pet.id)).toBeNull()
    expect(recordCache.get(bobik.pet.id)).toEqual(kept(bobik))
  })

  it('keeps what it had when the network failed: the page shows it as stale', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordCache.set(murka.pet.id, kept(murka))
    const action = await loadRecord(api(async () => Promise.reject(new TypeError('Failed to fetch'))), murka.pet.id, TODAY, () => true)
    expect(action).toEqual({ type: 'failed', failure: 'failed' })
    expect(recordCache.get(murka.pet.id)).toEqual(kept(murka))
    expect(warn).toHaveBeenCalledOnce()
  })

  it('drops an answer the page no longer wants — nothing dispatched, nothing kept or forgotten', async () => {
    recordCache.set(bobik.pet.id, kept(bobik))
    await expect(loadRecord(api(async () => murka), murka.pet.id, TODAY, () => false)).resolves.toBeNull()
    expect(recordCache.get(murka.pet.id)).toBeNull()
    const refused = api(async () => Promise.reject(new ApiError('unauthorized', 401, 'expired')))
    await expect(loadRecord(refused, murka.pet.id, TODAY, () => false)).resolves.toBeNull()
    expect(recordCache.get(bobik.pet.id)).toEqual(kept(bobik))
  })
})

describe('the summary for the vet, through the same step', () => {
  it('is never kept itself, and still clears the record’s cache on 401 and 404', async () => {
    recordCache.set(murka.pet.id, kept(murka))
    const summary = { generated_on: TODAY } as VetSummary
    await expect(loadStep(async () => summary, murka.pet.id, () => true, { label: 'vet-summary' })).resolves.toEqual({ type: 'loaded', data: summary })
    expect(recordCache.get(murka.pet.id)).toEqual(kept(murka))

    await loadStep(async () => Promise.reject(new ApiError('not_found', 404, 'gone')), murka.pet.id, () => true, { label: 'vet-summary' })
    expect(recordCache.get(murka.pet.id)).toBeNull()

    recordCache.set(bobik.pet.id, kept(bobik))
    await loadStep(async () => Promise.reject(new ApiError('unauthorized', 401, 'expired')), murka.pet.id, () => true, { label: 'vet-summary' })
    expect(recordCache.get(bobik.pet.id)).toBeNull()
  })
})
