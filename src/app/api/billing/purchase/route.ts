import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/server-auth'
import { getProvider } from '@/lib/payments/registry'
import { createBillingTransaction } from '@/lib/billing-transactions'
import type { PaymentProviderName } from '@/types/billing'

interface PurchaseBody {
  package_id: string
  provider?: PaymentProviderName
  save_payment_method?: boolean
}

function getAppBaseUrl(request: NextRequest): string {
  const configuredUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (configuredUrl) return configuredUrl.replace(/\/$/, '')
  return request.nextUrl.origin
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as PurchaseBody
  if (!body?.package_id) {
    return NextResponse.json({ error: 'package_id_required' }, { status: 400 })
  }

  const provider: PaymentProviderName = body.provider ?? 'dummy'
  const savePaymentMethod = body.save_payment_method ?? true

  const supabase = createServiceClient()

  let created
  try {
    created = await createBillingTransaction(supabase, {
      userId: user.id,
      provider,
      packageId: body.package_id,
      metadata: { save_payment_method: savePaymentMethod },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'create_failed'
    const status = msg.includes('package_not_found') ? 404 : msg.includes('inactive') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  const txId = created.transaction_id
  const amountCents = created.amount
  const currency = created.currency
  const packageName = created.package_name

  // 2. Call provider Init to get PaymentURL.
  try {
    const returnUrl = `${getAppBaseUrl(request)}/billing/return/${txId}`
    const initResult = await getProvider(provider).initPayment({
      transactionId: txId,
      userId: user.id,
      amountCents,
      currency,
      description: `Лапка — ${packageName}`,
      returnUrl,
      savePaymentMethod,
    })

    const { error: pendingErr } = await supabase.rpc('mark_transaction_pending', {
      p_transaction_id: txId,
      p_provider_payment_id: initResult.providerPaymentId,
    })
    if (pendingErr) throw pendingErr

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
