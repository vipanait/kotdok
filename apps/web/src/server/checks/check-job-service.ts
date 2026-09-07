/**
 * Running an analysis as a job.
 *
 * The contract has always described creating a check as accepting work rather
 * than returning a result. That shape is kept here even though the work happens
 * inside the request: photographs and the background worker were moved to the
 * end of the queue, so there is nowhere to hand the job to yet. A client polls
 * the job either way, which is what stops stage 6 from becoming a breaking
 * change for anything already written against this.
 *
 * No `next/*` import belongs in this file — the route adapter turns these
 * outcomes into responses.
 */

import type { ErrorCode, ParsedCheckCreateInput } from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import {
  analyzeSymptomCheck,
  type AnalyzeSymptomCheckInput,
  type AnalyzeSymptomCheckOutcome,
} from '@/server/symptom-check/analyze-symptom-check'

type SupabaseService = ReturnType<typeof createServiceClient>

export type CreateCheckJobInput = ParsedCheckCreateInput & {
  userId: string
  /** From the `Idempotency-Key` header, when the client sent one. */
  idempotencyKey: string | null
}

/**
 * The analysis itself, injected so the job machinery can be tested without an
 * AI provider. What is worth testing here is what happens around the call —
 * whether the job is recorded, a retry is refused a second credit, a failure
 * leaves a code — and none of that should depend on a network key being set.
 */
export type Analyse = (
  supabase: SupabaseService,
  input: AnalyzeSymptomCheckInput,
) => Promise<AnalyzeSymptomCheckOutcome>

export type CreateCheckJobOutcome =
  | { ok: true; jobId: string; reused: boolean }
  | { ok: false; code: ErrorCode; message: string }

export type CheckJobRecord = {
  job_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  check_id: string | null
  error_code: ErrorCode | null
  created_at: string
  updated_at: string
}

/**
 * Accepts an analysis and runs it.
 *
 * @returns the job to poll, or why nothing was started. A refusal here means no
 *   job exists at all: a client that gets one has nothing to poll for, and a
 *   credit was never touched.
 */
export async function createCheckJob(
  supabase: SupabaseService,
  input: CreateCheckJobInput,
  analyse: Analyse = analyzeSymptomCheck,
): Promise<CreateCheckJobOutcome> {
  // Photographs are switched off product-wide until stage 6. Saying so plainly
  // beats accepting the ids and quietly analysing text only, which would look
  // to the sender like the pictures were considered.
  if (input.upload_ids.length > 0) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'Загрузка фотографий пока недоступна',
    }
  }

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(supabase, input.userId, input.idempotencyKey)
    // A repeat of a request already accepted returns the same job rather than
    // starting a second analysis and spending a second credit.
    if (existing) return { ok: true, jobId: existing, reused: true }
  }

  const { data: created, error: insertError } = await supabase
    .from('check_jobs')
    .insert({
      user_id: input.userId,
      status: 'processing',
      idempotency_key: input.idempotencyKey,
    })
    .select('id')
    .single()

  if (insertError || !created) {
    // A duplicate key means the same request arrived twice at once. The other
    // one is doing the work; point the caller at it.
    if (input.idempotencyKey) {
      const existing = await findByIdempotencyKey(supabase, input.userId, input.idempotencyKey)
      if (existing) return { ok: true, jobId: existing, reused: true }
    }
    return { ok: false, code: 'internal_error', message: 'Не удалось принять проверку' }
  }

  const jobId: string = created.id

  const outcome = await analyse(supabase, {
    userId: input.userId,
    symptoms: input.symptoms,
    petId: input.pet_id ?? null,
    photos: [],
    appetite: input.appetite ?? null,
    activity: input.activity ?? null,
    duration: input.duration ?? null,
    stool: input.stool ?? null,
    pain_signs: input.pain_signs,
  })

  if (outcome.ok) {
    await finish(supabase, jobId, { status: 'completed', check_id: outcome.checkId })
    return { ok: true, jobId, reused: false }
  }

  await finish(supabase, jobId, { status: 'failed', error_code: outcome.code })

  // The job exists and records the failure, so the caller can poll it — but the
  // refusal is also returned directly, because a client that asked once and got
  // an answer immediately should not have to poll to learn it failed.
  return { ok: false, code: outcome.code, message: outcome.message }
}

async function findByIdempotencyKey(
  supabase: SupabaseService,
  userId: string,
  key: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('check_jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle()

  return data?.id ?? null
}

async function finish(
  supabase: SupabaseService,
  jobId: string,
  patch: { status: 'completed' | 'failed'; check_id?: string; error_code?: ErrorCode },
): Promise<void> {
  const { error } = await supabase
    .from('check_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)

  // The analysis itself is done either way, so this must not throw. But a job
  // left saying `processing` is one a client polls until it gives up, with no
  // trace of why — so it is said out loud rather than swallowed.
  if (error) {
    console.error(`could not close check job ${jobId} as ${patch.status}:`, error.message)
  }
}

/**
 * @returns the job, or null when it is not this person's or does not exist —
 *   the two are deliberately indistinguishable, so job ids cannot be probed.
 */
export async function getCheckJob(
  supabase: SupabaseService,
  userId: string,
  jobId: string,
): Promise<CheckJobRecord | null> {
  const { data } = await supabase
    .from('check_jobs')
    .select('id, status, check_id, error_code, created_at, updated_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  return {
    job_id: data.id,
    status: data.status,
    check_id: data.check_id ?? null,
    error_code: (data.error_code as ErrorCode | null) ?? null,
    created_at: toUtcIso(data.created_at),
    updated_at: toUtcIso(data.updated_at),
  }
}
