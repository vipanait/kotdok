import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { chargeSavedPayment } from '@/server/billing/billing-service'

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

  try {
    const result = await chargeSavedPayment({
      userId: user.id,
      packageId: body.package_id,
      paymentMethodId: body.payment_method_id,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'create_failed'
    if (msg === 'payment_method_not_found') {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (msg.startsWith('charge_failed:')) {
      return NextResponse.json({ error: 'charge_failed', detail: msg.slice('charge_failed:'.length) }, { status: 502 })
    }
    return NextResponse.json(
      { error: msg },
      { status: 500 },
    )
  }
}
