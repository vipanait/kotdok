import 'server-only'

import {
  CheckHistoryPageSchema,
  HISTORY_PAGE_SIZE_DEFAULT,
  type CheckHistoryPage,
  type SymptomCheckRecord,
} from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'

type SupabaseService = ReturnType<typeof createServiceClient>

export type HistoryFailure = 'account_deleting' | 'account_not_found' | 'bad_cursor' | 'not_found' | 'storage_error'

export type HistoryResult<T> = { ok: true; data: T } | { ok: false; reason: HistoryFailure }

/**
 * A cursor is the (created_at, id) pair of the last row on the page.
 *
 * Paging by timestamp alone loses or repeats rows whenever two checks share a
 * `created_at`, which happens: the fixtures contain exactly that case. Both
 * halves travel together so the ordering is total.
 */
type Cursor = { createdAt: string; id: string }

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url')
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const [createdAt, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|')
    if (!createdAt || !id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

async function requireActiveAccount(
  supabase: SupabaseService,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: HistoryFailure }> {
  const account = await loadAccount(supabase, userId)
  if (account.ok) return { ok: true }

  return {
    ok: false,
    reason: account.reason === 'account_deleting' ? 'account_deleting' : 'account_not_found',
  }
}

/** Contract dates are UTC ISO 8601; two of these columns have no zone at all. */
function toContract(record: SymptomCheckRecord): SymptomCheckRecord {
  return { ...record, created_at: toUtcIso(record.created_at) }
}

export type ListChecksInput = {
  userId: string
  petId?: string
  limit?: number
  cursor?: string
}

export async function listChecks(
  supabase: SupabaseService,
  input: ListChecksInput,
): Promise<HistoryResult<CheckHistoryPage>> {
  const allowed = await requireActiveAccount(supabase, input.userId)
  if (!allowed.ok) return allowed

  const limit = input.limit ?? HISTORY_PAGE_SIZE_DEFAULT

  let query = supabase
    .from('symptom_checks')
    .select(symptomCheckSelect())
    .eq('user_id', input.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // One extra row tells us whether another page exists without a second query.
    .limit(limit + 1)

  if (input.petId) query = query.eq('pet_id', input.petId)

  if (input.cursor) {
    const cursor = decodeCursor(input.cursor)
    if (!cursor) return { ok: false, reason: 'bad_cursor' }

    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data, error } = await query
  if (error) return { ok: false, reason: 'storage_error' }

  const rows = data ?? []
  const hasMore = rows.length > limit
  const page = (hasMore ? rows.slice(0, limit) : rows).map((row) =>
    toContract(mapSymptomCheckRow(row as never)),
  )

  // The cursor carries the raw column values, so the comparison the next query
  // makes is against what the database actually stores, not a reformatted copy.
  const last = hasMore ? (rows[limit - 1] as unknown as { created_at: string; id: string }) : null
  const nextCursor = last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null

  return {
    ok: true,
    data: CheckHistoryPageSchema.parse({ items: page, next_cursor: nextCursor }),
  }
}

export async function getCheck(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
): Promise<HistoryResult<SymptomCheckRecord>> {
  const allowed = await requireActiveAccount(supabase, userId)
  if (!allowed.ok) return allowed

  const { data, error } = await supabase
    .from('symptom_checks')
    .select(symptomCheckSelect())
    .eq('id', checkId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { ok: false, reason: 'storage_error' }
  // Someone else's check is indistinguishable from one that never existed.
  if (!data) return { ok: false, reason: 'not_found' }

  return { ok: true, data: toContract(mapSymptomCheckRow(data as never)) }
}
