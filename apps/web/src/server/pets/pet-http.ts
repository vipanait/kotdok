import 'server-only'

import { NextResponse } from 'next/server'
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
  if (message) console.error('pet request failed:', message)
  return NextResponse.json({ error: 'Storage error' }, { status: 500 })
}
