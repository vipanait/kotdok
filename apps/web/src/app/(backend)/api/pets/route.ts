import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { owesConsent } from '@/server/consent/consent-service'
import { createPet } from '@/server/pets/pet-service'
import { datesAhead, petFailureResponse } from '@/server/pets/pet-http'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

// Only the writes are left here: the site lists pets on the server, the apps
// through GET /api/v1/pets, and nothing called GET /api/pets.
export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await owesConsent(user.id)) return NextResponse.json({ error: 'Consent required' }, { status: 403 })

  const body = await request.json()
  if (datesAhead(body)) return NextResponse.json({ error: 'Body does not match the contract' }, { status: 400 })
  const result = await createPet(createServiceClient(), user.id, body)
  if (!result.ok) return petFailureResponse(result.reason, result.message)

  return NextResponse.json(result.data, { status: 201 })
}
