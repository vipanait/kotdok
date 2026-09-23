import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { isCronAuthorized } from '@/server/account/deletion-cron'
import { sweepExpiredUploads } from '@/server/uploads/photo-storage'

/**
 * Daily removal of photos that were uploaded and never attached to a check
 * (stage 6/03), called by Vercel Cron as configured in vercel.json. Attached
 * photos are removed by the check itself; this only catches the abandoned
 * ones. Answers a count — no ids, no paths.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const removed = await sweepExpiredUploads(createServiceClient())
    return NextResponse.json({ removed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[photo-uploads] sweep failed')
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
