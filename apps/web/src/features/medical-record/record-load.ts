import type { HealthOverview, SymptomCheckRecord } from '@lapka/contracts'
import { ApiError, type ApiClient } from '@lapka/shared'

/**
 * Loading a medical record, as states a screen can draw. Kept apart from
 * React so the rules the stage cares most about are tested without a
 * browser: a failed request is never an empty, "healthy" record; data seen
 * before stays on screen with a retry; a pet that is not the caller's, or a
 * session that ended, leaves nothing of the record behind.
 */

/** The check history is secondary: its failure does not hide the record. */
export type ChecksPart = { status: 'ready'; items: SymptomCheckRecord[] } | { status: 'failed' }

export type RecordData = { overview: HealthOverview; checks: ChecksPart }

export type RecordState =
  /** First load, nothing to show yet: a skeleton. */
  | { status: 'loading' }
  /** No data and the request failed: an error with a retry, never an empty record. */
  | { status: 'failed'; retrying: boolean }
  | {
      status: 'ready'
      data: RecordData
      /** A refresh is running over data already shown. */
      refreshing: boolean
      /** The last refresh failed: the data on screen is from before. */
      stale: boolean
    }
  /** Not this owner's pet, deleted, or no such id: nothing is shown. */
  | { status: 'not_found' }
  /** The session is gone: nothing is shown, sign in again. */
  | { status: 'signed_out' }
  /** The account is being deleted: the cabinet is closed. */
  | { status: 'deleting' }

export type LoadFailure = 'not_found' | 'signed_out' | 'deleting' | 'failed'

export type RecordAction =
  | { type: 'start' }
  | { type: 'loaded'; data: RecordData }
  | { type: 'failed'; failure: LoadFailure }

export function initialRecordState(cached: RecordData | null): RecordState {
  return cached ? { status: 'ready', data: cached, refreshing: true, stale: false } : { status: 'loading' }
}

export function recordReducer(state: RecordState, action: RecordAction): RecordState {
  switch (action.type) {
    case 'start':
      if (state.status === 'ready') return { ...state, refreshing: true }
      if (state.status === 'failed') return { status: 'failed', retrying: true }
      return { status: 'loading' }
    case 'loaded':
      return { status: 'ready', data: action.data, refreshing: false, stale: false }
    case 'failed':
      switch (action.failure) {
        case 'not_found':
          return { status: 'not_found' }
        case 'signed_out':
          return { status: 'signed_out' }
        case 'deleting':
          return { status: 'deleting' }
        case 'failed':
          // What was loaded before stays, marked as such; without it, an error.
          return state.status === 'ready'
            ? { ...state, refreshing: false, stale: true }
            : { status: 'failed', retrying: false }
      }
  }
}

/** What a failed request means for the screen. Anything unrecognised is a plain failure. */
export function classifyFailure(error: unknown): LoadFailure {
  if (error instanceof ApiError) {
    if (error.code === 'not_found') return 'not_found'
    if (error.code === 'unauthorized') return 'signed_out'
    if (error.code === 'account_deleting') return 'deleting'
  }
  return 'failed'
}

/** How many checks the record shows; the full history is its own page. */
export const RECORD_CHECKS_LIMIT = 3

/**
 * The record and its latest checks, in parallel. The record decides: if it
 * fails, the whole load fails. The history failing only marks the history —
 * unless it failed for a reason that closes the page (session, access).
 */
export async function fetchRecord(api: ApiClient, petId: string): Promise<RecordData> {
  const [overview, checks] = await Promise.allSettled([
    api.getHealthOverview(petId),
    api.listChecks({ pet_id: petId, limit: RECORD_CHECKS_LIMIT }),
  ])
  if (overview.status === 'rejected') throw overview.reason
  if (checks.status === 'rejected') {
    if (classifyFailure(checks.reason) !== 'failed') throw checks.reason
    return { overview: overview.value, checks: { status: 'failed' } }
  }
  return { overview: overview.value, checks: { status: 'ready', items: checks.value.items } }
}

/**
 * Records seen in this tab, by pet: going to the form and back shows the
 * record at once and refreshes it underneath. Memory only — a reload, a
 * sign-out (a full page load) or a closed tab forgets it, and it is never
 * written to storage another visitor of the browser could read.
 */
const seen = new Map<string, RecordData>()

export const recordCache = {
  get: (petId: string) => seen.get(petId) ?? null,
  set: (petId: string, data: RecordData) => void seen.set(petId, data),
  forget: (petId: string) => void seen.delete(petId),
  clear: () => seen.clear(),
}
