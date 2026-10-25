import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { isCronAuthorized } from '@/server/account/deletion-cron'
import { expireFollowups } from '@/server/followup/followup-service'

/**
 * Daily: closes follow-up cases nobody answered for a week after their last
 * question, as `expired`. Called by Vercel Cron as configured in vercel.json.
 * Answers a count — no ids.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const expired = await expireFollowups(createServiceClient())
    return NextResponse.json({ expired }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[followup-expiry] failed')
    return NextResponse.json({ error: 'Expiry failed' }, { status: 500 })
  }
}
