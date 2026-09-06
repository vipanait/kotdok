import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
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

  const { id } = await params
  const body = await request.json()
  const result = await updatePet(createServiceClient(), user.id, id, body)
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

  const { id } = await params
  const result = await softDeletePetAndChecks(createServiceClient(), user.id, id)
  if (!result.ok) return petFailureResponse(result.reason, result.message)

  return new NextResponse(null, { status: 204 })
}
