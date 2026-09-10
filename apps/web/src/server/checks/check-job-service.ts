/**
 * Running an analysis as a job.
 *
 * Two halves that never run in the same request: accepting the work, and doing
 * it. Accepting is one database transaction — the account is checked, the check
 * is reserved and the job is recorded, or none of that happens. Doing it is a
 * worker that claims a job, holds a lease while it talks to the model, and is
 * refused if it comes back after the lease expired.
 *
 * The balance lives here rather than inside the analysis, because the request
 * that paid is gone by the time the answer arrives. One reservation per job,
 * released once if the job finally fails.
 *
 * No `next/*` import belongs in this file — the route adapter turns these
 * outcomes into responses.
 */

import { createHash, randomUUID } from 'node:crypto'
import type { ErrorCode, ParsedCheckCreateInput } from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import {
  analyzeSymptomCheck,
  type AnalyzeSymptomCheckInput,
  type AnalyzeSymptomCheckOutcome,
} from '@/server/symptom-check/analyze-symptom-check'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * How long a worker may hold a job.
 *
 * Longer than both the model timeout and the platform's own limit on a
 * function, so a worker killed mid-call cannot go on holding work it will never
 * finish. The number is the one settled in
 * `docs/architecture/jobs-uploads-deletion.md`.
 */
const LEASE_SECONDS = 360

export type CreateCheckJobInput = ParsedCheckCreateInput & {
  userId: string
  /** From the `Idempotency-Key` header, when the client sent one. */
  idempotencyKey: string | null
}

/**
 * The analysis itself, injected so the job machinery can be tested without an
 * AI provider. What is worth testing here is what happens around the call —
 * whether the lease is respected, whether a final failure returns the check,
 * whether a late worker is refused — and none of that should depend on a
 * network key being set.
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

/** What the worker needs to run a job it has just claimed. */
type ClaimedJob = {
  id: string
  user_id: string
  payload: Record<string, unknown>
}

/**
 * What one turn of the worker did.
 *
 * `lost` is not a failure: it means the lease had expired and somebody else now
 * owns the job. The right response is to drop what was computed, which is what
 * makes a killed-and-restarted worker safe.
 */
export type WorkOutcome = 'idle' | 'completed' | 'retryable' | 'failed' | 'lost'

/**
 * The inputs, in a form that is the same for two identical requests.
 *
 * Keys sorted, absent and null treated alike, pain signs ordered — a client that
 * builds the same request twice must produce the same fingerprint, or its retry
 * would look like a different question wearing a used key.
 */
export function fingerprintCheckInput(input: ParsedCheckCreateInput): string {
  const canonical = {
    symptoms: input.symptoms.trim(),
    pet_id: input.pet_id ?? null,
    appetite: input.appetite ?? null,
    activity: input.activity ?? null,
    duration: input.duration ?? null,
    stool: input.stool ?? null,
    pain_signs: [...input.pain_signs].sort(),
  }

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

/**
 * Accepts an analysis.
 *
 * @returns the job to poll, or why nothing was started. A refusal here means no
 *   job exists at all: a client that gets one has nothing to poll for, and the
 *   balance was never touched.
 */
export async function createCheckJob(
  supabase: SupabaseService,
  input: CreateCheckJobInput,
): Promise<CreateCheckJobOutcome> {
  // Photographs left the product on 10 September and come back in a later
  // version. Saying so plainly beats accepting the ids and quietly analysing
  // text only, which would look to the sender like the pictures were considered.
  if (input.upload_ids.length > 0) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'Загрузка фотографий пока недоступна',
    }
  }

  const payload = {
    symptoms: input.symptoms,
    pet_id: input.pet_id ?? null,
    appetite: input.appetite ?? null,
    activity: input.activity ?? null,
    duration: input.duration ?? null,
    stool: input.stool ?? null,
    pain_signs: input.pain_signs,
  }

  const { data, error } = await supabase.rpc('enqueue_check_job', {
    p_user_id: input.userId,
    p_payload: payload,
    p_fingerprint: fingerprintCheckInput(input),
    p_idempotency_key: input.idempotencyKey,
  })

  if (error || !data) {
    return { ok: false, code: 'internal_error', message: 'Не удалось принять проверку' }
  }

  const outcome = data as { status: string; job_id?: string }

  switch (outcome.status) {
    case 'created':
      return { ok: true, jobId: outcome.job_id!, reused: false }
    case 'reused':
      return { ok: true, jobId: outcome.job_id!, reused: true }
    case 'conflict':
      return {
        ok: false,
        code: 'conflict',
        message: 'Этот ключ уже использован для другого запроса',
      }
    case 'inactive':
      return { ok: false, code: 'account_deleting', message: 'Аккаунт удаляется' }
    case 'insufficient_credits':
      return { ok: false, code: 'insufficient_credits', message: 'Проверки на балансе закончились' }
    default:
      return { ok: false, code: 'internal_error', message: 'Не удалось принять проверку' }
  }
}

/**
 * Codes that will say the same thing however many times they are tried.
 *
 * A deleted pet stays deleted and a leaving account keeps leaving; spending
 * another call to the model to be told so again costs money and changes
 * nothing. Everything else — the model timing out, the network, us — is worth
 * one more attempt.
 */
function isFinal(code: ErrorCode): boolean {
  return code === 'not_found' || code === 'account_deleting' || code === 'bad_request'
}

/**
 * Takes one job and runs it, if there is one.
 *
 * Safe to call from several places at once: the request that created the job,
 * the status poll the client is already making, and the sweeper all reach for
 * work the same way, and the claim is what settles who gets it.
 */
export async function runNextCheckJob(
  supabase: SupabaseService,
  analyse: Analyse = analyzeSymptomCheck,
  worker: string = randomUUID(),
): Promise<WorkOutcome> {
  const { data, error } = await supabase.rpc('claim_check_job', {
    p_worker: worker,
    p_lease_seconds: LEASE_SECONDS,
  })

  if (error) {
    console.error('could not claim a check job:', error.message)
    return 'idle'
  }
  if (!data) return 'idle'

  const job = data as ClaimedJob
  const payload = job.payload ?? {}

  let outcome: AnalyzeSymptomCheckOutcome
  try {
    outcome = await analyse(supabase, {
      userId: job.user_id,
      symptoms: String(payload.symptoms ?? ''),
      petId: (payload.pet_id as string | null) ?? null,
      photos: [],
      appetite: (payload.appetite as string | null) ?? null,
      activity: (payload.activity as string | null) ?? null,
      duration: (payload.duration as string | null) ?? null,
      stool: (payload.stool as string | null) ?? null,
      pain_signs: (payload.pain_signs as string[] | undefined) ?? [],
    } as AnalyzeSymptomCheckInput)
  } catch (cause) {
    // A throw is not a verdict: the next attempt may well succeed, and the
    // lease is what stops this one from being held for ever.
    console.error('check job threw:', cause)
    await report(supabase, job.id, worker, 'internal_error', false)
    return 'retryable'
  }

  if (outcome.ok) {
    const { data: held } = await supabase.rpc('complete_check_job', {
      p_job_id: job.id,
      p_worker: worker,
      p_check_id: outcome.checkId,
    })
    // False means the lease expired and another worker owns the job now. The
    // check is saved either way; what must not happen is this worker also
    // marking the job done and pointing the reservation at its own result.
    return held === true ? 'completed' : 'lost'
  }

  const final = isFinal(outcome.code)
  const held = await report(supabase, job.id, worker, outcome.code, final)
  if (!held) return 'lost'
  return final ? 'failed' : 'retryable'
}

async function report(
  supabase: SupabaseService,
  jobId: string,
  worker: string,
  code: ErrorCode,
  final: boolean,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fail_check_job', {
    p_job_id: jobId,
    p_worker: worker,
    p_error_code: code,
    p_final: final,
  })

  if (error) {
    // The job keeps its lease and the sweeper will pick it up. Said out loud
    // rather than swallowed: a job nobody reports on is a job a client polls
    // until it gives up.
    console.error(`could not report check job ${jobId}:`, error.message)
    return false
  }

  return data === true
}

/**
 * Runs jobs until there are none left or the budget is spent.
 *
 * The budget exists because the platform will kill this eventually, and a
 * worker that stops on its own terms leaves nothing half-claimed.
 */
export async function drainCheckJobs(
  supabase: SupabaseService,
  limit = 5,
  analyse: Analyse = analyzeSymptomCheck,
): Promise<{ ran: number; outcomes: WorkOutcome[] }> {
  const outcomes: WorkOutcome[] = []

  for (let i = 0; i < limit; i += 1) {
    const outcome = await runNextCheckJob(supabase, analyse)
    if (outcome === 'idle') break
    outcomes.push(outcome)
  }

  return { ran: outcomes.length, outcomes }
}

/** Puts expired leases back in the queue and gives up on the ones out of attempts. */
export async function recoverStuckCheckJobs(supabase: SupabaseService): Promise<number> {
  const { data, error } = await supabase.rpc('recover_stuck_check_jobs', {})
  if (error) {
    console.error('could not recover stuck check jobs:', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
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
