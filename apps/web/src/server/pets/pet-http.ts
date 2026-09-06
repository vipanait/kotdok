import 'server-only'

import { NextResponse } from 'next/server'
import type { PetFailure } from '@/server/pets/pet-service'

/** Maps a service failure to the status these routes have always returned. */
export function petFailureResponse(reason: PetFailure, message?: string) {
  if (reason === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (reason === 'account_deleting') {
    return NextResponse.json({ error: 'Account is being deleted' }, { status: 403 })
  }
  return NextResponse.json({ error: message ?? 'Storage error' }, { status: 500 })
}
