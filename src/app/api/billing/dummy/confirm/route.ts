// Triggered by the mock checkout page. Builds a webhook payload and posts it
// to /api/billing/webhook/dummy, simulating what a real PSP would do.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/server-auth'
import type { DummyWebhookPayload } from '@/lib/payments/dummy'

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

  const supabase = createServiceClient()
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, user_id, provider, provider_payment_id, payment_method_id')
    .eq('id', body.transaction_id)
    .single()

  if (!tx || tx.user_id !== user.id || tx.provider !== 'dummy') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (!tx.provider_payment_id) {
    return NextResponse.json({ error: 'transaction_not_initialized' }, { status: 400 })
  }

  const payload: DummyWebhookPayload = {
    providerPaymentId: tx.provider_payment_id,
    status: body.outcome,
    reason: body.outcome === 'failed' ? 'simulated_decline' : undefined,
  }

  // Simulate first-time-saved-card data only on success and only when no
  // saved-card flow was used (no payment_method_id linked).
  if (body.outcome === 'succeeded' && body.save_card && !tx.payment_method_id) {
    payload.rebillId = `dummy_pm_${Math.random().toString(36).slice(2, 10)}`
    payload.cardLast4 = '4242'
    payload.cardBrand = 'Visa'
    payload.cardExpMonth = 12
    payload.cardExpYear = new Date().getFullYear() + 3
  }

  const webhookUrl = `${request.nextUrl.origin}/api/billing/webhook/dummy`
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return NextResponse.json({ error: 'webhook_failed', detail: text }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
