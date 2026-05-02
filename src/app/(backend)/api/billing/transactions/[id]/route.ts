import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { getTransaction } from '@/server/billing/billing-queries'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await getTransaction(supabase, user.id, id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
