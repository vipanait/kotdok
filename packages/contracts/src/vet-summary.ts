import { z } from 'zod'
import { PetSchema } from './pet'
import { CalendarDateSchema, IsoDateTimeSchema, UrgencySchema, UuidSchema } from './primitives'
import { HealthEventSchema, MedicationSchema, WeightMeasurementSchema } from './medical-record'

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

export const VetSummaryParasiteSchema = z.object({
  group: z.enum(['fleas_ticks', 'worms']),
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
  /** The server's day the summary was made; «за последний год» counts back from it. */
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
export type VetSummaryVaccination = z.infer<typeof VetSummaryVaccinationSchema>
export type VetSummaryParasite = z.infer<typeof VetSummaryParasiteSchema>
