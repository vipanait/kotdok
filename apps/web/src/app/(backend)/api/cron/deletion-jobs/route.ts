import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/server/supabase/server'
import { isCronAuthorized, runDeletionCron } from '@/server/account/deletion-cron'

/**
 * Daily run of the account deletion worker (stage 8/05), called by Vercel Cron
 * as configured in vercel.json. Answers counts only — no ids, no addresses.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runDeletionCron(createServiceClient())
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[account-deletion] cron run failed')
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 })
  }
}
