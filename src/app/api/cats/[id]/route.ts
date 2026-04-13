import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('cats')
    .update(sanitize(body))
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('cats')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

function sanitize(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? '').trim() || 'Кот',
    breed: body.breed ? String(body.breed).trim() || null : null,
    age_years: body.age_years != null && body.age_years !== '' ? Number(body.age_years) : null,
    weight_kg: body.weight_kg != null && body.weight_kg !== '' ? Number(body.weight_kg) : null,
    sex: ['male', 'female'].includes(body.sex as string) ? body.sex : null,
    neutered: body.neutered != null ? Boolean(body.neutered) : null,
    indoor_outdoor: ['indoor', 'outdoor', 'both'].includes(body.indoor_outdoor as string) ? body.indoor_outdoor : null,
    diet: ['dry', 'wet', 'mixed', 'raw'].includes(body.diet as string) ? body.diet : null,
    allergies: Array.isArray(body.allergies) ? body.allergies : [],
    vaccinated: body.vaccinated != null ? Boolean(body.vaccinated) : null,
    chronic_conditions: Array.isArray(body.chronic_conditions) ? body.chronic_conditions : [],
    medications: Array.isArray(body.medications) ? body.medications : [],
  }
}
