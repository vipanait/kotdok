import { z } from 'zod'
import { IsoDateTimeSchema, UuidSchema } from './primitives'

// Questions after a result (docs/superpowers/specs/2026-11-13-check-questions-design.md):
// the owner may ask a few things about one finished check and gets a short
// answer that knows the check, its result and the pet's record. A bounded
// dialogue about one check, not a chat.
//
// Its own resource, `/checks/{id}/questions`, rather than fields on the
// check: the check's schema is strict, and installed builds would reject a
// new field. Builds that do not know the resource never call it.
//
// Not to be confused with `followup.ts`, the «лучше / так же / хуже» loop.

/** Owner's decision of 13 November 2026: three per check, free of credits. */
export const CHECK_QUESTION_LIMIT = 3
/** …and only while the check still describes the pet: 48 hours from it. */
export const CHECK_QUESTION_WINDOW_HOURS = 48

export const CHECK_QUESTION_MIN = 3
export const CHECK_QUESTION_MAX = 500

/**
 * What an answer may add to the check's own urgency, never lower it: the
 * question mentioned something that makes the picture worse. The words shown
 * for each are the client's, fixed, not the model's.
 */
export const CHECK_QUESTION_ALERTS = ['none', 'see_vet_today', 'clinic_now'] as const
export const CheckQuestionAlertSchema = z.enum(CHECK_QUESTION_ALERTS)
export type CheckQuestionAlert = z.infer<typeof CheckQuestionAlertSchema>

// Responses are `z.object`, not strict: a build already installed must keep
// reading a thread after the server learns a new field. The input stays strict.

/** One answered question. A question still being answered is never served. */
export const CheckQuestionSchema = z.object({
  id: UuidSchema,
  question: z.string(),
  answer: z.string(),
  alert: CheckQuestionAlertSchema,
  /** The question was not about this check; the answer is the fixed refusal. */
  off_topic: z.boolean(),
  created_at: IsoDateTimeSchema,
})

export type CheckQuestion = z.infer<typeof CheckQuestionSchema>

/** `GET /checks/{id}/questions`: the dialogue so far and whether it may go on. */
export const CheckQuestionThreadSchema = z.object({
  items: z.array(CheckQuestionSchema),
  limit: z.int().min(0),
  remaining: z.int().min(0),
  /** The check's time plus the window. After it the thread can only be read. */
  open_until: IsoDateTimeSchema,
  /** Why no more questions are taken, or `null` while they are. */
  closed: z.enum(['limit', 'expired']).nullable(),
})

export type CheckQuestionThread = z.infer<typeof CheckQuestionThreadSchema>

export const CheckQuestionInputSchema = z.strictObject({
  question: z.string().trim().min(CHECK_QUESTION_MIN).max(CHECK_QUESTION_MAX),
})

export type CheckQuestionInput = z.infer<typeof CheckQuestionInputSchema>

/** `POST /checks/{id}/questions`: the answer and the thread after it. */
export const CheckQuestionResultSchema = z.object({
  item: CheckQuestionSchema,
  thread: CheckQuestionThreadSchema,
})

export type CheckQuestionResult = z.infer<typeof CheckQuestionResultSchema>
