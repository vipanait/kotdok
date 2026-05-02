import { NextRequest, NextResponse } from 'next/server'
import { applyProviderWebhook, isKnownEnabledProvider } from '@/server/billing/billing-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params
  if (!isKnownEnabledProvider(providerParam)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  }
  const provider = providerParam

  const rawBody = await request.text()
  try {
    await applyProviderWebhook(provider, rawBody, request.headers)
  } catch (err) {
    console.error(`[webhook ${provider}] error:`, err)
    // Do not leak details to the provider. Tinkoff expects plain "OK" on success;
    // a non-OK body lets them retry, which is what we want on signature failure.
    return new NextResponse('WEBHOOK_FAILED', { status: 400 })
  }

  return new NextResponse('OK', { status: 200 })
}
