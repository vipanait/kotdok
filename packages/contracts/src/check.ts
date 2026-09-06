import { z } from 'zod'
import { IsoDateTimeSchema, PetSpeciesSchema, UrgencySchema, UuidSchema } from './primitives'

/**
 * A stored symptom check as history and the result screen show it.
 *
 * This type used to live inside a UI component, which made the web screens the
 * definition of an API contract. It belongs here so the Expo client can rely on
 * it without importing anything from the site.
 */
export const SymptomCheckRecordSchema = z.strictObject({
  id: UuidSchema,
  symptoms_input: z.string(),
  urgency: UrgencySchema,
  urgency_reason: z.string(),
  possible_causes: z.array(z.string()),
  species_specific_warning: z.string().nullable(),
  home_care_steps: z.array(z.string()),
  vet_questions: z.array(z.string()),
  /** Raw model output plus the quick-assessment answers; shape varies by version. */
  full_response: z.record(z.string(), z.unknown()).nullable(),
  created_at: IsoDateTimeSchema,
  pet_id: UuidSchema.nullable(),
  pet_name: z.string().nullable(),
  pet_species: PetSpeciesSchema.nullable(),
})

export type SymptomCheckRecord = z.infer<typeof SymptomCheckRecordSchema>

/**
 * What a result renderer needs. Same fields as a stored record, except the id:
 * a check that has just come back from the analysis endpoint is rendered before
 * the client knows where it was saved.
 */
export type SymptomCheckView = Omit<SymptomCheckRecord, 'id'> & { id: string | null }

/** Page size the server will serve; a larger request is clamped, not honoured. */
export const HISTORY_PAGE_SIZE_MAX = 50
export const HISTORY_PAGE_SIZE_DEFAULT = 20

export const CheckHistoryQuerySchema = z.strictObject({
  pet_id: UuidSchema.optional(),
  limit: z.int().min(1).max(HISTORY_PAGE_SIZE_MAX).default(HISTORY_PAGE_SIZE_DEFAULT),
  /** Opaque; produced by the server from (created_at, id) so ties stay stable. */
  cursor: z.string().min(1).optional(),
})

export type CheckHistoryQuery = z.input<typeof CheckHistoryQuerySchema>

export const CheckHistoryPageSchema = z.strictObject({
  items: z.array(SymptomCheckRecordSchema).max(HISTORY_PAGE_SIZE_MAX),
  next_cursor: z.string().min(1).nullable(),
})

export type CheckHistoryPage = z.infer<typeof CheckHistoryPageSchema>
