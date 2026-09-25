import { z } from 'zod'
import { PetSchema } from './pet'
import { CalendarDateSchema, UuidSchema } from './primitives'

/**
 * The five sections of a pet's medical record, in the order the screen lists
 * them. The spec: docs/design/medical-record-spec.md, §3.
 */
export const HEALTH_SECTIONS = ['vaccinations', 'parasites', 'visits', 'medications', 'weight'] as const

export const HealthSectionSchema = z.enum(HEALTH_SECTIONS)

export type HealthSection = z.infer<typeof HealthSectionSchema>


/** Checked here and by the table's CHECK constraint (supabase/migrations, pet_weights). */
export const WEIGHT_MAX_KG = 200

const WeightKgSchema = z.number().positive().max(WEIGHT_MAX_KG)

export const WEIGHT_SOURCES = ['record', 'form'] as const

/**
 * One weighing, newest first in the overview.
 *
 * `measured_on` is null only for the value the pet form held before the
 * record existed: its day is unknown and is not made up. `source: 'form'`
 * marks a weight that came from the form, dated or not.
 */
export const WeightMeasurementSchema = z.strictObject({
  id: UuidSchema,
  measured_on: CalendarDateSchema.nullable(),
  weight_kg: z.number(),
  source: z.enum(WEIGHT_SOURCES),
})

export type WeightMeasurement = z.infer<typeof WeightMeasurementSchema>

/** A new weighing. A second one for the same day replaces that day's value. */
export const WeightInputSchema = z.strictObject({
  measured_on: CalendarDateSchema,
  weight_kg: WeightKgSchema,
})

export type WeightInput = z.infer<typeof WeightInputSchema>

/** A correction. A measurement can move to another day but never lose its date. */
export const WeightPatchSchema = WeightInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'at least one field is required' },
)

export type WeightPatch = z.infer<typeof WeightPatchSchema>

/**
 * Everything the medical record screen needs in one request.
 *
 * `pet` is the pet form exactly as `GET /pets/{id}` returns it: the record is
 * never empty, because what the owner already said in the form is shown there
 * (spec §2.2). `writable` lists the sections this server can store records in;
 * the client offers "add" only for those, so a section a later release brings
 * is not a button that fails.
 *
 * Not strict, unlike the pet itself: every medical record stage adds to this
 * response, and an app already on phones must keep reading it. Unknown keys
 * are dropped, not rejected. The server builds the object field by field, so
 * leniency here lets nothing extra out.
 */
export const HealthOverviewSchema = z.object({
  pet: PetSchema,
  writable: z.array(HealthSectionSchema),
  // Defaulted, so a newer app reading an older server sees an empty history.
  weights: z.array(WeightMeasurementSchema).default([]),
})

export type HealthOverview = z.infer<typeof HealthOverviewSchema>
