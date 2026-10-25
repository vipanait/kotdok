import 'server-only'

import type { CheckCaseLink, CheckFollowup, FollowupCase, FollowupCaseSummary, SymptomCheckRecord } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import {
  caseLinksOf,
  getCheckFollowup,
  getFollowupCase,
  listActiveFollowups,
} from '@/server/followup/followup-service'
import { loadCheckResult } from '@/server/checks/load-check-pages'
import type { CheckPet } from '@/shared/types'

/**
 * What the site's pages read of the follow-up loop (FU-02, FU-07), through
 * the same service the v1 routes use. Writes go from the browser through
 * `/api/v1` with the site's session (`browserApi`).
 */

/**
 * The reminder of one result. Optional on that page: a failed read leaves
 * the result without the card and is logged, rather than taking the result
 * down with it.
 */
export async function loadResultFollowup(userId: string, checkId: string): Promise<CheckFollowup | null> {
  const result = await getCheckFollowup(createServiceClient(), userId, checkId)
  if (result.ok) return result.data
  if (result.reason !== 'not_found') console.error('[followup] result card left out:', result.reason)
  return null
}

/**
 * Open cases for the overview's banners. A failed read leaves the overview
 * without them and is logged: they only point somewhere.
 */
export async function loadActiveFollowups(userId: string): Promise<FollowupCaseSummary[]> {
  const result = await listActiveFollowups(createServiceClient(), userId)
  if (result.ok) return result.data
  console.error('[followup] banners left out:', result.reason)
  return []
}

export type FollowupCasePage = {
  case: FollowupCase
  /** The pet's current profile: breed and age for its card. */
  pet: CheckPet | null
  /** The case's latest check as stored: its home care steps after «так же». */
  latest: SymptomCheckRecord | null
}

/**
 * One case of this user with what its pages show, or `null` when there is
 * none to show them: someone else's, a deleted pet's or check's, a malformed
 * id. A failed read throws, to the error page — never «not found».
 */
export async function loadFollowupCasePage(userId: string, caseId: string): Promise<FollowupCasePage | null> {
  const result = await getFollowupCase(createServiceClient(), userId, caseId)
  if (!result.ok) {
    if (result.reason === 'not_found') return null
    throw new Error(`Could not load the follow-up case: ${result.reason}`)
  }
  const latestId = result.data.checks.at(-1)?.check_id ?? result.data.origin_check_id
  const loaded = await loadCheckResult(userId, latestId)
  return { case: result.data, pet: loaded?.pet ?? null, latest: loaded?.check ?? null }
}

/** The case of each check in a history, and how many answers each case has. */
export async function loadHistoryCases(
  userId: string,
  checks: SymptomCheckRecord[],
): Promise<{ links: Map<string, CheckCaseLink>; checkins: Map<string, number> }> {
  const service = createServiceClient()
  const links = await caseLinksOf(service, userId, checks.map((check) => check.id))
  if (!links.ok) {
    // The history still lists every check, one row each, as before the loop.
    console.error('[followup] history shown without cases:', links.reason)
    return { links: new Map(), checkins: new Map() }
  }
  const caseIds = [...new Set([...links.data.values()].map((link) => link.case_id))]
  const checkins = new Map<string, number>()
  if (caseIds.length > 0) {
    const { data, error } = await service
      .from('followup_checkins')
      .select('case_id')
      .eq('user_id', userId)
      .in('case_id', caseIds)
    if (error) console.error('[followup] history shown without check-in counts:', error.message)
    for (const row of (data ?? []) as { case_id: string }[]) checkins.set(row.case_id, (checkins.get(row.case_id) ?? 0) + 1)
  }
  return { links: links.data, checkins }
}
