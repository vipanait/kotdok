import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getProvider } from '@/lib/payments/registry'
import type { PaymentProviderName } from '@/types/billing'

const VALID_PROVIDERS: PaymentProviderName[] = ['tinkoff', 'stripe', 'yookassa']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params
  if (!VALID_PROVIDERS.includes(providerParam as PaymentProviderName)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  }
  const provider = providerParam as PaymentProviderName

  const rawBody = await request.text()

  let event
  try {
    event = await getProvider(provider).parseWebhook(rawBody)
  } catch (err) {
    console.error(`[webhook ${provider}] parse error:`, err)
    // Do not leak details to the provider. Tinkoff expects plain "OK" on success;
    // a non-OK body lets them retry, which is what we want on signature failure.
    return new NextResponse('BAD_SIGNATURE', { status: 400 })
  }

  if (!event) {
    // Intermediate status we chose to ignore. Ack so the provider stops retrying.
    return new NextResponse('OK', { status: 200 })
  }

  const supabase = createServiceClient()

  try {
    if (event.status === 'succeeded') {
      const { error } = await supabase.rpc('apply_transaction_success', {
        p_provider: provider,
        p_provider_payment_id: event.providerPaymentId,
        p_provider_event_id: event.providerEventId,
        p_payload: event.payload as Record<string, unknown>,
        p_rebill_id: event.rebillId ?? null,
        p_card_last4: event.cardLast4 ?? null,
        p_card_brand: event.cardBrand ?? null,
        p_card_exp_month: event.cardExpMonth ?? null,
        p_card_exp_year: event.cardExpYear ?? null,
      })
      if (error) throw error
    } else {
      const { error } = await supabase.rpc('apply_transaction_terminal', {
        p_provider: provider,
        p_provider_payment_id: event.providerPaymentId,
        p_provider_event_id: event.providerEventId,
        p_status: event.status,
        p_reason: event.reason ?? null,
        p_payload: event.payload as Record<string, unknown>,
      })
      if (error) throw error
    }
  } catch (err) {
    console.error(`[webhook ${provider}] apply error:`, err)
    // Return non-OK so provider retries.
    return new NextResponse('APPLY_FAILED', { status: 500 })
  }

  return new NextResponse('OK', { status: 200 })
}
