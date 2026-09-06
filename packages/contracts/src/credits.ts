import { z } from 'zod'

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

export const FeedbackInputSchema = z.strictObject({
  rating: z.enum(FEEDBACK_RATINGS),
  comment: z.string().max(FEEDBACK_COMMENT_MAX).optional(),
})

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>
