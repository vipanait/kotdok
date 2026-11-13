import 'server-only'

import {
  CHECK_QUESTION_LIMIT,
  CHECK_QUESTION_WINDOW_HOURS,
  type CheckQuestion,
  type CheckQuestionAlert,
  type CheckQuestionResult,
  type CheckQuestionThread,
  type SymptomCheckRecord,
} from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import type { ServiceFailure } from '@/server/api/failure-response'
import { consumeRateLimit } from '@/server/api/rate-limit'
import { loadAnalysisContext } from '@/server/medical-record/analysis-context'
import {
  ANALYSIS_MODEL,
  describePetProfile,
  describeQuickAssessment,
  getVetContext,
  openai,
} from '@/server/symptom-check/analyze-symptom-check'
import { mapSymptomCheckRow, symptomCheckSelect } from '@/server/symptom-check/map-symptom-check'
import type { Pet } from '@/shared/types'
import { sanitizeSpecies } from '@/shared/utils/pet-utils'
import { normalizeAnswer } from './question-answer'
import { questionMessages, type QuestionContext } from './question-prompt'

/**
 * Questions about one finished check
 * (docs/superpowers/specs/2026-11-13-check-questions-design.md): three per
 * check, within 48 hours of it, free of credits.
 *
 * The limit, the window and the idempotency key are kept by the database
 * (`reserve_check_question`); this module asks the model in between and gives
 * the place back when no answer came.
 */

type SupabaseService = ReturnType<typeof createServiceClient>

export type QuestionFailure = ServiceFailure | 'too_many_requests' | 'model_unavailable' | 'key_reused'
export type QuestionResult<T> = { ok: true; data: T } | { ok: false; reason: QuestionFailure }

/**
 * One call to the model for an answer: shorter than an analysis, which reads
 * photos. Two attempts of half a minute fit inside the route's 90 seconds, and
 * a phone waits 75.
 */
export const QUESTION_MODEL_TIMEOUT_MS = 30_000
export const QUESTION_MODEL_MAX_RETRIES = 1
export const QUESTION_MAX_TOKENS = 500

type QuestionRow = {
  id: string
  question: string
  answer: string | null
  alert: CheckQuestionAlert
  off_topic: boolean
  created_at: string
}

const QUESTION_COLUMNS = 'id, question, answer, alert, off_topic, created_at'

function toItem(row: QuestionRow): CheckQuestion {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer ?? '',
    alert: row.alert,
    off_topic: row.off_topic,
    created_at: toUtcIso(row.created_at),
  }
}

async function loadCheck(supabase: SupabaseService, userId: string, checkId: string): Promise<QuestionResult<SymptomCheckRecord>> {
  const { data, error } = await supabase
    .from('symptom_checks')
    .select(symptomCheckSelect())
    .eq('id', checkId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { ok: false, reason: 'storage_error' }
  // Someone else's check is indistinguishable from one that never existed.
  if (!data) return { ok: false, reason: 'not_found' }
  return { ok: true, data: mapSymptomCheckRow(data as never) }
}

/** The answered questions of a check, oldest first. One still being answered is not among them. */
async function answeredRows(supabase: SupabaseService, checkId: string): Promise<QuestionRow[] | null> {
  const { data, error } = await supabase
    .from('check_questions')
    .select(QUESTION_COLUMNS)
    .eq('check_id', checkId)
    .not('answer', 'is', null)
    .order('created_at', { ascending: true })
  return error ? null : ((data ?? []) as QuestionRow[])
}

function threadOf(checkedAt: string, rows: QuestionRow[], now: Date): CheckQuestionThread {
  // The column has no zone and holds UTC.
  const openUntil = new Date(new Date(toUtcIso(checkedAt)).getTime() + CHECK_QUESTION_WINDOW_HOURS * 3_600_000)
  const remaining = Math.max(0, CHECK_QUESTION_LIMIT - rows.length)
  return {
    items: rows.map(toItem),
    limit: CHECK_QUESTION_LIMIT,
    remaining,
    open_until: openUntil.toISOString(),
    closed: remaining === 0 ? 'limit' : now.getTime() >= openUntil.getTime() ? 'expired' : null,
  }
}

export async function getQuestionThread(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
  now: Date = new Date(),
): Promise<QuestionResult<CheckQuestionThread>> {
  const check = await loadCheck(supabase, userId, checkId)
  if (!check.ok) return check
  const rows = await answeredRows(supabase, checkId)
  if (!rows) return { ok: false, reason: 'storage_error' }
  return { ok: true, data: threadOf(check.data.created_at, rows, now) }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => String(item)) : [])

/** What the model reads about the check and its pet; the pet block is null without a live pet. */
async function questionContext(
  supabase: SupabaseService,
  userId: string,
  check: SymptomCheckRecord,
  earlier: QuestionRow[],
  question: string,
  today: string | undefined,
): Promise<QuestionContext> {
  const full = check.full_response ?? {}
  let petText: string | null = null
  let species = check.pet_species

  if (check.pet_id) {
    const { data: pet } = await supabase
      .from('pets').select('*').eq('id', check.pet_id).eq('user_id', userId).is('deleted_at', null).maybeSingle()
    if (pet) {
      species = sanitizeSpecies(pet.species)
      // The same block the analysis read (MR-10); a record that cannot be read leaves the form alone.
      const record = await loadAnalysisContext(supabase, userId, pet.id, today, pet as Pet)
      const profile = record.medications ? { ...pet, medications: record.medications } : pet
      petText = `PET PROFILE: ${describePetProfile(profile, species)}${record.text ? `\n\n${record.text}` : ''}`
    }
  }

  const quick = describeQuickAssessment({
    appetite: text(full.appetite),
    activity: text(full.activity),
    duration: text(full.duration),
    stool: text(full.stool),
    pain_signs: strings(full.pain_signs),
  })

  return {
    locale: check.locale,
    species,
    check: {
      symptoms: check.symptoms_input,
      urgency: check.urgency,
      urgencyReason: check.urgency_reason,
      possibleCauses: check.possible_causes,
      homeCareSteps: check.home_care_steps,
      vetQuestions: check.vet_questions,
      warning: check.species_specific_warning,
      photoObservations: text(full.photo_observations),
      quickAssessment: quick || null,
    },
    petText,
    earlier: earlier.map((row) => ({ question: row.question, answer: row.answer ?? '' })),
    // Searched by the symptoms and the question together: the question alone is often three words.
    vetContext: await getVetContext(supabase, `${check.symptoms_input}\n${question}`, species ?? 'cat'),
    question,
  }
}

async function askModel(context: QuestionContext): Promise<string> {
  const { system, user } = questionMessages(context)
  const completion = await openai().chat.completions.create(
    {
      model: ANALYSIS_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_completion_tokens: QUESTION_MAX_TOKENS,
    },
    { timeout: QUESTION_MODEL_TIMEOUT_MS, maxRetries: QUESTION_MODEL_MAX_RETRIES },
  )
  const content = completion.choices[0]?.message.content
  if (!content) throw new Error('Empty response from the model')
  return content
}

type Reserved = {
  outcome: 'reserved' | 'replayed' | 'in_progress' | 'limit_reached' | 'expired' | 'not_found' | 'key_reused'
  question: QuestionRow | null
}

export type AskCheckQuestionInput = {
  userId: string
  checkId: string
  /** Already trimmed and measured by the contract. */
  question: string
  /** The client's Idempotency-Key: the same key with the same words is the same question. */
  clientKey: string
  /** The owner's calendar day the medical record is read on, as for an analysis. */
  today?: string
  now?: Date
}

/**
 * Asks one question about a check and waits for the answer.
 *
 * A place is taken first and given back if no answer comes, so a failed call
 * never costs the owner one of their three. Nothing here touches credits.
 */
export async function askCheckQuestion(
  supabase: SupabaseService,
  input: AskCheckQuestionInput,
): Promise<QuestionResult<CheckQuestionResult>> {
  const now = input.now ?? new Date()

  // Before the place is taken and long before the model is called.
  const rate = await consumeRateLimit(supabase, 'check_question_create', input.userId)
  if (!rate.allowed) return { ok: false, reason: 'too_many_requests' }

  const check = await loadCheck(supabase, input.userId, input.checkId)
  if (!check.ok) return check

  const { data, error } = await supabase.rpc('reserve_check_question', {
    p_user_id: input.userId,
    p_check_id: input.checkId,
    p_question: input.question,
    p_client_key: input.clientKey,
    // The language of the check: the thread stands under its result.
    p_locale: check.data.locale,
    p_now: now.toISOString(),
  })
  if (error || !data) {
    console.error('reserving a check question failed:', error?.message)
    return { ok: false, reason: 'storage_error' }
  }
  const reserved = data as Reserved

  switch (reserved.outcome) {
    case 'not_found':
      return { ok: false, reason: 'not_found' }
    case 'key_reused':
      return { ok: false, reason: 'key_reused' }
    case 'in_progress':
    case 'limit_reached':
    case 'expired':
      return { ok: false, reason: 'conflict' }
    default:
  }
  if (!reserved.question) return { ok: false, reason: 'storage_error' }

  if (reserved.outcome === 'replayed') {
    const rows = await answeredRows(supabase, input.checkId)
    if (!rows) return { ok: false, reason: 'storage_error' }
    return { ok: true, data: { item: toItem(reserved.question), thread: threadOf(check.data.created_at, rows, now) } }
  }

  const placeId = reserved.question.id
  try {
    const earlier = await answeredRows(supabase, input.checkId)
    if (!earlier) throw new Error('earlier questions could not be read')

    const context = await questionContext(supabase, input.userId, check.data, earlier, input.question, input.today)
    const answer = normalizeAnswer(await askModel(context), check.data.urgency, check.data.locale)

    const { data: stored, error: storeError } = await supabase
      .from('check_questions')
      .update({ answer: answer.answer, alert: answer.alert, off_topic: answer.offTopic, answered_at: new Date().toISOString() })
      .eq('id', placeId)
      .is('answer', null)
      .select(QUESTION_COLUMNS)
      .maybeSingle()
    // No row: the place was taken for abandoned in the meantime and cleared.
    if (storeError || !stored) throw new Error(storeError?.message ?? 'the question is gone')

    const row = stored as QuestionRow
    return { ok: true, data: { item: toItem(row), thread: threadOf(check.data.created_at, [...earlier, row], now) } }
  } catch (failure) {
    console.error('check question error:', failure)
    const { error: releaseError } = await supabase.from('check_questions').delete().eq('id', placeId).is('answer', null)
    // Left behind, it is cleared by the next reservation two minutes on.
    if (releaseError) console.error('check question place could not be released:', releaseError.message)
    return { ok: false, reason: 'model_unavailable' }
  }
}

// Lives apart so the follow-up service can read it without importing the analysis.
export { questionsForRecheck } from './recheck-questions'
