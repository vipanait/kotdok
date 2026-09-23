import { z } from 'zod'
import { UuidSchema } from './primitives'

/** Mirrors the extra_check_request_status enum. */
export const EXTRA_CHECK_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const

export const ExtraCheckRequestStatusValueSchema = z.enum(EXTRA_CHECK_REQUEST_STATUSES)

/** `null` means the user has never asked for an extra check. */
export const ExtraCheckRequestStatusSchema = z.strictObject({
  status: ExtraCheckRequestStatusValueSchema.nullable(),
})

export type ExtraCheckRequestStatus = z.infer<typeof ExtraCheckRequestStatusSchema>

export const FEEDBACK_RATINGS = ['liked', 'disliked'] as const
const FEEDBACK_COMMENT_MAX = 2000

export const FeedbackRatingSchema = z.enum(FEEDBACK_RATINGS)

export type FeedbackRating = z.infer<typeof FeedbackRatingSchema>

/**
 * An opinion on one result. Sending another for the same check replaces the
 * first: people change their minds after the visit to the vet.
 */
export const FeedbackInputSchema = z.strictObject({
  check_id: UuidSchema,
  rating: FeedbackRatingSchema,
  comment: z.string().max(FEEDBACK_COMMENT_MAX).optional(),
})

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>

/**
 * The opinion already given on a check, so the result screen does not ask
 * twice. A separate resource rather than a field on the check: the check's
 * schema is strict, and builds already installed would reject a new field.
 */
export const CheckFeedbackSchema = z.strictObject({
  rating: FeedbackRatingSchema.nullable(),
})

export type CheckFeedback = z.infer<typeof CheckFeedbackSchema>
