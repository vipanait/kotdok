import { z } from 'zod'
import { IsoDateTimeSchema, UuidSchema } from './primitives'
import { ErrorCodeSchema } from './errors'

// Quick-assessment answers. The value sets are the ones the web form already
// posts and the analysis service already validates.
export const APPETITE_VALUES = ['normal', 'reduced', 'none'] as const
export const ACTIVITY_VALUES = ['normal', 'low', 'lethargic'] as const
export const DURATION_VALUES = ['today', '2-3days', 'week+'] as const
export const STOOL_VALUES = ['normal', 'loose', 'absent', 'bloody'] as const
export const PAIN_SIGNS = [
  'tense',
  'hunched',
  'grimace',
  'touch_sensitive',
  'hiding',
  'vocalizing',
] as const

export type PainSign = (typeof PAIN_SIGNS)[number]

export const SYMPTOMS_MIN = 3
export const SYMPTOMS_MAX = 2000

export const CheckCreateInputSchema = z.strictObject({
  pet_id: UuidSchema.nullable().optional(),
  symptoms: z.string().min(SYMPTOMS_MIN).max(SYMPTOMS_MAX),
  /** Ids handed out by POST /uploads; a raw URL is never accepted. */
  upload_ids: z.array(UuidSchema).max(5).default([]),
  appetite: z.enum(APPETITE_VALUES).nullable().optional(),
  activity: z.enum(ACTIVITY_VALUES).nullable().optional(),
  duration: z.enum(DURATION_VALUES).nullable().optional(),
  stool: z.enum(STOOL_VALUES).nullable().optional(),
  pain_signs: z.array(z.enum(PAIN_SIGNS)).max(PAIN_SIGNS.length).default([]),
})

/** What a client sends: the defaulted lists may be omitted. */
export type CheckCreateInput = z.input<typeof CheckCreateInputSchema>

/** What the server works with after parsing, with the defaults filled in. */
export type ParsedCheckCreateInput = z.output<typeof CheckCreateInputSchema>

/** Header name carrying the client-generated idempotency key on POST /checks. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
export const IdempotencyKeySchema = z.string().min(8).max(200)

/**
 * Creating an analysis returns a job, not a result: the work continues after the
 * HTTP response. `job_id` identifies the processing, `check_id` the stored
 * result — they are never the same identifier.
 */
export const CheckJobAcceptedSchema = z.strictObject({
  job_id: UuidSchema,
  status_url: z.string().min(1),
})

export type CheckJobAccepted = z.infer<typeof CheckJobAcceptedSchema>

export const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const
export const JobStatusSchema = z.enum(JOB_STATUSES)
export type JobStatus = z.infer<typeof JobStatusSchema>

export const CheckJobStatusSchema = z.strictObject({
  job_id: UuidSchema,
  status: JobStatusSchema,
  /** Set only once the job has completed and the result was stored. */
  check_id: UuidSchema.nullable(),
  /** Set only on `failed`; the client branches on the code, not the message. */
  error_code: ErrorCodeSchema.nullable(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
})

export type CheckJobStatus = z.infer<typeof CheckJobStatusSchema>

// Uploads. The server hands out a scoped permission to write one immutable
// object; the client never tells the server which URL to read.
export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const UploadRequestSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        content_type: z.enum(UPLOAD_CONTENT_TYPES),
        size_bytes: z.int().min(1),
      }),
    )
    .min(1)
    .max(5),
})

export type UploadRequest = z.infer<typeof UploadRequestSchema>

export const UploadGrantSchema = z.strictObject({
  uploads: z.array(
    z.strictObject({
      upload_id: UuidSchema,
      url: z.url(),
      method: z.literal('PUT'),
      headers: z.record(z.string(), z.string()),
      expires_at: IsoDateTimeSchema,
    }),
  ),
})

export type UploadGrant = z.infer<typeof UploadGrantSchema>
