import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { ERROR_STATUS } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { sanitizePainSigns } from '@/shared/utils/check-params'
import {
  analyzeSymptomCheck,
  type AnalysisPhoto,
  type AnalyzeSymptomCheckInput,
} from '@/server/symptom-check/analyze-symptom-check'

/**
 * The HTTP side of an analysis: session, request parsing, upload limits, status
 * codes and cache revalidation. The business rules live in
 * `analyze-symptom-check.ts`, which never sees a Request or a Response.
 */

const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_PHOTO_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]

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
  let symptoms = ''
  let petId: string | null = null
  let appetite: string | null = null
  let activity: string | null = null
  let duration: string | null = null
  let stool: string | null = null
  let painSignsRaw: unknown = null
  const photos: AnalysisPhoto[] = []

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    symptoms = (formData.get('symptoms') as string) ?? ''
    petId = (formData.get('pet_id') as string) || (formData.get('cat_id') as string) || null
    appetite = (formData.get('appetite') as string) || null
    activity = (formData.get('activity') as string) || null
    duration = (formData.get('duration') as string) || null
    stool = (formData.get('stool') as string) || null
    painSignsRaw = formData.get('pain_signs')

    const files = formData.getAll('photo') as File[]
    const validFiles = files.filter(f => f && f.size > 0).slice(0, MAX_PHOTOS)
    for (const file of validFiles) {
      if (file.size > MAX_PHOTO_BYTES) {
        return { ok: false, response: badRequest('Каждое фото должно быть до 5 МБ') }
      }
      if (!ALLOWED_PHOTO_MIMES.includes(file.type)) {
        return { ok: false, response: badRequest('Допустимы только изображения (JPEG, PNG, WebP)') }
      }
      const buffer = await file.arrayBuffer()
      photos.push({ data: Buffer.from(buffer).toString('base64'), mimeType: file.type })
    }
  } else {
    const body = await request.json()
    symptoms = body.symptoms ?? ''
    petId = body.pet_id || body.cat_id || null
    appetite = body.appetite || null
    activity = body.activity || null
    duration = body.duration || null
    stool = body.stool || null
    painSignsRaw = body.pain_signs ?? null
  }

  symptoms = symptoms.slice(0, 2000)

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
      photos,
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
