import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { createServiceClient } from '@/server/supabase/server'
import { recordConsent } from '@/server/consent/consent-service'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

/** The site's twin of POST /api/v1/consent. Consent given here is from the web. */
const BodySchema = z.strictObject({ version: z.string().min(1).max(32) })

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const result = await recordConsent(createServiceClient(), user.id, {
    version: parsed.data.version,
    source: 'web',
  })
  if (!result.ok) {
    return result.reason === 'stale_version'
      ? NextResponse.json({ error: 'Not the current edition of the consent' }, { status: 400 })
      : NextResponse.json({ error: 'Failed to record the consent' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
