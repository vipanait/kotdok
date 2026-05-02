import { NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { listActivePackages } from '@/server/billing/billing-queries'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await listActivePackages(supabase)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
