// Triggered by the mock checkout page. Builds a webhook payload and posts it
// to /api/billing/webhook/dummy, simulating what a real PSP would do.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { confirmDummyCheckout } from '@/server/billing/billing-service'

interface Body {
  transaction_id: string
  outcome: 'succeeded' | 'failed' | 'canceled'
  save_card?: boolean
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Body
  if (!body?.transaction_id || !body?.outcome) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  try {
    const result = await confirmDummyCheckout({
      userId: user.id,
      transactionId: body.transaction_id,
      outcome: body.outcome,
      saveCard: body.save_card,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'webhook_failed'
    const status = msg === 'not_found' ? 404 : msg === 'transaction_not_initialized' ? 400 : 502
    return NextResponse.json({ error: msg, detail: msg }, { status })
  }
}
