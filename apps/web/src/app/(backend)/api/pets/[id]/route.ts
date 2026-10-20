import { NextRequest, NextResponse } from 'next/server'
import { PetUpdateInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { owesConsent } from '@/server/consent/consent-service'
import { softDeletePetAndChecks, updatePet } from '@/server/pets/pet-service'
import { petFailureResponse } from '@/server/pets/pet-http'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await owesConsent(user.id)) return NextResponse.json({ error: 'Consent required' }, { status: 403 })

  const { id } = await params
  // The same contract as /api/v1: a future birth date or a day that does not
  // exist is a 400 here too, not a 500 from the database (PR #82 review).
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 })
  }
  const parsed = PetUpdateInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Body does not match the contract' }, { status: 400 })
  const result = await updatePet(createServiceClient(), user.id, id, parsed.data)
  if (!result.ok) return petFailureResponse(result.reason, result.message)

  return NextResponse.json(result.data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await owesConsent(user.id)) return NextResponse.json({ error: 'Consent required' }, { status: 403 })

  const { id } = await params
  const result = await softDeletePetAndChecks(createServiceClient(), user.id, id)
  if (!result.ok) return petFailureResponse(result.reason, result.message)

  return new NextResponse(null, { status: 204 })
}
