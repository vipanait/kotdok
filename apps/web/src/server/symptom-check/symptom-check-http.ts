import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { ERROR_STATUS } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { sanitizePainSigns } from '@/shared/utils/check-params'
import {
  analyzeSymptomCheck,
  type AnalyzeSymptomCheckInput,
} from '@/server/symptom-check/analyze-symptom-check'

/**
 * The HTTP side of an analysis: session, request parsing, status codes and cache
 * revalidation. The business rules live in `analyze-symptom-check.ts`, which
 * never sees a Request or a Response.
 *
 * Photo upload is off. Bodies were sent as `multipart/form-data` with the images
 * inline, and Vercel drops any body over 4.5 MB before the function runs, so a
 * couple of phone photos failed with an unexplained 413. Uploads come back when
 * they go straight to private storage and only ids reach this route (stage 6);
 * until then this adapter accepts JSON only, and the analysis service keeps its
 * photo support with an always-empty list.
 */

const VALID_APPETITE = ['normal', 'reduced', 'none']
const VALID_ACTIVITY = ['normal', 'low', 'lethargic']
const VALID_DURATION = ['today', '2-3days', 'week+']
const VALID_STOOL = ['normal', 'loose', 'absent', 'bloody']

function narrow(value: string | null, allowed: string[]): string | null {
  return value && allowed.includes(value) ? value : null
}

type ParsedRequest =
  | { ok: true; input: Omit<AnalyzeSymptomCheckInput, 'userId'> }
  | { ok: false; response: NextResponse }

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

async function parseRequest(request: NextRequest): Promise<ParsedRequest> {
  const contentType = request.headers.get('content-type') ?? ''

  // A form-data body can only be an older client still sending photos: answer it
  // with a reason instead of letting the platform cut it off with a bare 413.
  if (contentType.includes('multipart/form-data')) {
    return {
      ok: false,
      response: badRequest('Загрузка фото временно отключена — опишите симптомы текстом'),
    }
  }

  const body = await request.json()
  const symptoms = String(body.symptoms ?? '').slice(0, 2000)
  const petId: string | null = body.pet_id || body.cat_id || null
  const appetite: string | null = body.appetite || null
  const activity: string | null = body.activity || null
  const duration: string | null = body.duration || null
  const stool: string | null = body.stool || null
  const painSignsRaw: unknown = body.pain_signs ?? null

  if (!symptoms || symptoms.trim().length < 3) {
    return { ok: false, response: badRequest('Опишите симптомы (минимум 3 символа)') }
  }

  return {
    ok: true,
    input: {
      symptoms,
      petId,
      appetite: narrow(appetite, VALID_APPETITE),
      activity: narrow(activity, VALID_ACTIVITY),
      duration: narrow(duration, VALID_DURATION),
      stool: narrow(stool, VALID_STOOL),
      pain_signs: sanitizePainSigns(painSignsRaw),
      photos: [],
    },
  }
}

export async function handleSymptomCheckRequest(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  const parsed = await parseRequest(request)
  if (!parsed.ok) return parsed.response

  const outcome = await analyzeSymptomCheck(supabase, { ...parsed.input, userId: user.id })

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message }, { status: ERROR_STATUS[outcome.code] })
  }

  revalidatePath('/dashboard')

  return NextResponse.json({
    ...outcome.result,
    has_photo: outcome.hasPhoto,
    ...outcome.quickAssessment,
    check_id: outcome.checkId,
    credits_remaining: outcome.creditsRemaining,
  })
}
