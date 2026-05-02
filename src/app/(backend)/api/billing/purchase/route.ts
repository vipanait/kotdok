import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { initiatePurchase } from '@/server/billing/billing-service'
import type { PaymentProviderName } from '@/shared/types/billing'

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
  try {
    const result = await initiatePurchase({
      userId: user.id,
      packageId: body.package_id,
      provider,
      savePaymentMethod,
      returnBaseUrl: `${getAppBaseUrl(request)}/billing/return`,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'create_failed'
    if (msg.startsWith('provider_init_failed:')) {
      return NextResponse.json({ error: 'provider_init_failed', detail: msg.slice('provider_init_failed:'.length) }, { status: 502 })
    }
    const status = msg.includes('package_not_found') ? 404 : msg.includes('inactive') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
