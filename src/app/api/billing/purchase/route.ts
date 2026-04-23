import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/server-auth'
import { getProvider } from '@/lib/payments/registry'
import type { PaymentProviderName } from '@/types/billing'

interface PurchaseBody {
  package_id: string
  provider?: PaymentProviderName
  save_payment_method?: boolean
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as PurchaseBody
  if (!body?.package_id) {
    return NextResponse.json({ error: 'package_id_required' }, { status: 400 })
  }

  const provider: PaymentProviderName = body.provider ?? 'tinkoff'
  const savePaymentMethod = body.save_payment_method ?? true

  const supabase = createServiceClient()

  // 1. Create transaction + initial 'created' event (atomic, in DB function).
  const { data: created, error: createErr } = await supabase.rpc('create_transaction', {
    p_user_id: user.id,
    p_provider: provider,
    p_package_id: body.package_id,
    p_metadata: { save_payment_method: savePaymentMethod },
  })

  if (createErr || !created) {
    const msg = createErr?.message ?? 'create_failed'
    const status = msg.includes('package_not_found') ? 404 : msg.includes('inactive') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  const txId = created.transaction_id as string
  const amountCents = created.amount_cents as number
  const currency = created.currency as string
  const packageName = created.package_name as string

  // 2. Call provider Init to get PaymentURL.
  const origin = request.nextUrl.origin
  const returnUrl = `${origin}/billing/return/${txId}`

  try {
    const initResult = await getProvider(provider).initPayment({
      transactionId: txId,
      userId: user.id,
      amountCents,
      currency,
      description: `КотДок — ${packageName}`,
      returnUrl,
      savePaymentMethod,
    })

    await supabase.rpc('mark_transaction_pending', {
      p_transaction_id: txId,
      p_provider_payment_id: initResult.providerPaymentId,
    })

    return NextResponse.json({
      transaction_id: txId,
      redirect_url: initResult.redirectUrl,
    })
  } catch (err) {
    // Mark as failed via status event (best-effort; provider_payment_id may be null).
    await supabase.from('transaction_status_events').insert({
      transaction_id: txId,
      status: 'failed',
      reason: 'provider_init_error',
      payload: { message: err instanceof Error ? err.message : String(err) },
    })
    await supabase
      .from('transactions')
      .update({ current_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', txId)

    return NextResponse.json(
      { error: 'provider_init_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
