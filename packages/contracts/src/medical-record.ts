import { z } from 'zod'
import { PetSchema } from './pet'

/**
 * The five sections of a pet's medical record, in the order the screen lists
 * them. The spec: docs/design/medical-record-spec.md, §3.
 */
export const HEALTH_SECTIONS = ['vaccinations', 'parasites', 'visits', 'medications', 'weight'] as const

export const HealthSectionSchema = z.enum(HEALTH_SECTIONS)

export type HealthSection = z.infer<typeof HealthSectionSchema>

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
})

export type HealthOverview = z.infer<typeof HealthOverviewSchema>
