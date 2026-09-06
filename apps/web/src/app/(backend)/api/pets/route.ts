import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createPet, listPets } from '@/server/pets/pet-service'
import { petFailureResponse } from '@/server/pets/pet-http'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await listPets(createServiceClient(), user.id)
  if (!result.ok) return petFailureResponse(result.reason, result.message)

  return NextResponse.json(result.data)
}

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = await createPet(createServiceClient(), user.id, body)
  if (!result.ok) return petFailureResponse(result.reason, result.message)

  return NextResponse.json(result.data, { status: 201 })
}
