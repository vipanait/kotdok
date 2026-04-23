import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/server-auth'
import { getProvider } from '@/lib/payments/registry'

interface SavedPurchaseBody {
  package_id: string
  payment_method_id: string
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as SavedPurchaseBody
  if (!body?.package_id || !body?.payment_method_id) {
    return NextResponse.json({ error: 'package_id_and_payment_method_id_required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify payment method belongs to the user.
  const { data: pm, error: pmErr } = await supabase
    .from('payment_methods')
    .select('id, user_id, provider, provider_pm_id, deleted_at')
    .eq('id', body.payment_method_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (pmErr || !pm) {
    return NextResponse.json({ error: 'payment_method_not_found' }, { status: 404 })
  }

  const { data: created, error: createErr } = await supabase.rpc('create_transaction', {
    p_user_id: user.id,
    p_provider: pm.provider,
    p_package_id: body.package_id,
    p_metadata: { flow: 'saved_card' },
    p_payment_method_id: pm.id,
  })

  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? 'create_failed' }, { status: 500 })
  }

  const txId = created.transaction_id as string
  const amountCents = created.amount_cents as number
  const currency = created.currency as string
  const packageName = created.package_name as string

  try {
    const result = await getProvider(pm.provider).chargeSaved({
      transactionId: txId,
      userId: user.id,
      amountCents,
      currency,
      description: `КотДок — ${packageName}`,
      providerPmId: pm.provider_pm_id,
    })

    await supabase.rpc('mark_transaction_pending', {
      p_transaction_id: txId,
      p_provider_payment_id: result.providerPaymentId,
    })

    // The actual 'succeeded' state will arrive via webhook; respond with tx id
    // so the UI can poll /api/billing/transactions/[id] for confirmation.
    return NextResponse.json({ transaction_id: txId })
  } catch (err) {
    await supabase.from('transaction_status_events').insert({
      transaction_id: txId,
      status: 'failed',
      reason: 'provider_charge_error',
      payload: { message: err instanceof Error ? err.message : String(err) },
    })
    await supabase
      .from('transactions')
      .update({ current_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', txId)

    return NextResponse.json(
      { error: 'charge_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
