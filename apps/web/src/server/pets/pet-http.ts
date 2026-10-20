import 'server-only'

import { NextResponse } from 'next/server'
import { isFutureDay } from '@/server/medical-record/weight-service'
import type { PetFailure } from '@/server/pets/pet-service'

/**
 * Maps a service failure to the status these routes have always returned.
 *
 * The storage error itself stays on this side. PostgREST writes for whoever is
 * holding the database — table and column names, constraints, the id that would
 * not parse — and none of that helps the caller or belongs in their hands.
 */
export function petFailureResponse(reason: PetFailure, message?: string) {
  if (reason === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (reason === 'account_deleting') {
    return NextResponse.json({ error: 'Account is being deleted' }, { status: 403 })
  }
  // A check the stored record fails, such as the dates' order: the request's mistake.
  if (reason === 'invalid') return NextResponse.json({ error: 'Body does not match the stored record' }, { status: 400 })
  if (message) console.error('pet request failed:', message)
  return NextResponse.json({ error: 'Storage error' }, { status: 500 })
}

/**
 * A birth or home day ahead of every time zone (FB-2/01): refused by the
 * site's own routes as by /api/v1, not stored. Malformed days are the
 * contract's (or the sanitiser's) to deal with.
 */
export function datesAhead(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const { birth_date: birth, adopted_on: home } = body as { birth_date?: unknown; adopted_on?: unknown }
  return [birth, home].some((day) => typeof day === 'string' && isFutureDay(day))
}
