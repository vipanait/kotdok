import { z } from 'zod'
import { PetSchema } from './pet'
import { CalendarDateSchema, IsoDateTimeSchema, URGENCY_LEVELS, UrgencySchema, UuidSchema } from './primitives'
import { HealthEventSchema, MedicationSchema, WeightMeasurementSchema, readableEvents, readableWeights } from './medical-record'

/** One row of the vaccination table: a disease, its last shot and the next one planned. */
export const VetSummaryVaccinationSchema = z.object({
  /** A disease code; unknown codes from a later server are shown by code, not dropped. */
  target: z.string(),
  /** Vets recommend it for every animal of the species: listed even with no record. */
  core: z.boolean(),
  last_done: CalendarDateSchema.nullable(),
  /** The product of that last shot, as the owner recorded it. */
  product: z.string().nullable(),
  next: CalendarDateSchema.nullable(),
})

const PARASITE_ROW_GROUPS = ['fleas_ticks', 'worms'] as const

export const VetSummaryParasiteSchema = z.object({
  group: z.enum(PARASITE_ROW_GROUPS),
  last_done: CalendarDateSchema.nullable(),
  product: z.string().nullable(),
  next: CalendarDateSchema.nullable(),
})

export const VetSummaryCheckSchema = z.object({
  id: UuidSchema,
  created_at: IsoDateTimeSchema,
  urgency: UrgencySchema,
  /** The first line the owner wrote. */
  summary: z.string(),
})

/**
 * «Для врача» (spec §7.17, §7.18): everything a vet should see, in one
 * response the screen and the PDF are both built from. Nothing here is a
 * finding of absence: an empty list means the owner has recorded nothing, and
 * the apps say «Не указано владельцем», never «нет».
 *
 * Not strict, like the overview: later stages may add to it.
 */
export const VetSummarySchema = z.object({
  /** The day the summary was made for — the owner's `today` when the server accepted it, else the server's UTC day; «за последний год» counts back from it. */
  generated_on: CalendarDateSchema,
  pet: PetSchema,
  /** The newest dated measurements, newest first, at most five. The form's undated weight is `pet.weight_kg`. */
  weights: z.array(WeightMeasurementSchema).max(5),
  /** Courses being given now. */
  medications: z.array(MedicationSchema),
  /** Core diseases of the species first, then any other disease with a record. */
  vaccinations: z.array(VetSummaryVaccinationSchema),
  parasites: z.array(VetSummaryParasiteSchema),
  /** Visits that happened in the last year, newest first. */
  visits: z.array(HealthEventSchema),
  /** The latest symptom checks of this pet, at most three. */
  checks: z.array(VetSummaryCheckSchema).max(3),
})

export type VetSummary = z.infer<typeof VetSummarySchema>

/**
 * `GET /pets/{id}/health/summary?today=YYYY-MM-DD`: the owner's own calendar
 * day, which decides the courses taken now and the year of visits. The
 * server takes it only while it is today somewhere on Earth (UTC−12…UTC+14);
 * any other value, or none — an app older than this field — gives the
 * server's UTC day, as before.
 */
export const VetSummaryQuerySchema = z.object({ today: CalendarDateSchema.optional() })

export type VetSummaryQuery = z.infer<typeof VetSummaryQuerySchema>
export type VetSummaryVaccination = z.infer<typeof VetSummaryVaccinationSchema>
export type VetSummaryParasite = z.infer<typeof VetSummaryParasiteSchema>

/** Rows whose `field` holds a value this app does not know are left out; others are read as they are. */
function known(field: string, values: readonly unknown[]) {
  return (rows: unknown) =>
    Array.isArray(rows)
      ? rows.filter((row) => {
          if (typeof row !== 'object' || row === null) return true
          return values.includes((row as Record<string, unknown>)[field])
        })
      : rows
}

/**
 * The summary as a client reads it. A later server may add a parasite group,
 * an urgency level, a kind of record or of visit, or show more rows: those
 * rows are left out, not the whole screen. A broken row of a known kind
 * still fails, as in the overview.
 */
export const VetSummaryReadSchema = VetSummarySchema.extend({
  weights: z.preprocess(readableWeights, z.array(WeightMeasurementSchema)),
  parasites: z.preprocess(known('group', PARASITE_ROW_GROUPS), z.array(VetSummaryParasiteSchema)),
  visits: z.preprocess(readableEvents, z.array(HealthEventSchema)),
  checks: z.preprocess(known('urgency', URGENCY_LEVELS), z.array(VetSummaryCheckSchema)).transform((rows) => rows.slice(0, 3)),
})

