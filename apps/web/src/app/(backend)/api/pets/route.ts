import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createPet, listPets } from '@/server/pets/pet-service'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await listPets(supabase, user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createServiceClient()
  const { data, error } = await createPet(supabase, user.id, body)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
