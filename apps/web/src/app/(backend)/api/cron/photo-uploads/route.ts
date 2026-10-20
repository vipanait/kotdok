import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { isCronAuthorized } from '@/server/account/deletion-cron'
import { sweepExpiredUploads } from '@/server/uploads/photo-storage'
import { sweepAvatars } from '@/server/pets/avatar-service'

/**
 * Daily removal of photos that were uploaded and never attached to a check
 * (stage 6/03), called by Vercel Cron as configured in vercel.json. Attached
 * photos are removed by the check itself; this only catches the abandoned
 * ones. Pets' photos (FB-4) left by an unconfirmed upload, a lost race or a
 * write after account deletion go in the same pass. Answers counts — no ids.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const removed = await sweepExpiredUploads(supabase)
    const avatars = await sweepAvatars(supabase)
    return NextResponse.json({ removed, avatars }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[photo-uploads] sweep failed')
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
