import { z } from 'zod'
import {
  IsoDateTimeSchema,
  PetDietSchema,
  PetLifestyleSchema,
  PetSexSchema,
  PetSizeClassSchema,
  PetSpeciesSchema,
  PetWalkActivitySchema,
  UuidSchema,
} from './primitives'

// Lengths match the sanitiser the web app already applies before insert.
const NAME_MAX = 100
const BREED_MAX = 100
const NOTES_MAX = 300
const LIST_MAX_ITEMS = 20
const LIST_ITEM_MAX = 150

const stringList = z.array(z.string().min(1).max(LIST_ITEM_MAX)).max(LIST_MAX_ITEMS)

/** A pet as the API returns it. `user_id` stays server-side. */
export const PetSchema = z.strictObject({
  id: UuidSchema,
  species: PetSpeciesSchema,
  name: z.string().min(1).max(NAME_MAX),
  breed: z.string().max(BREED_MAX).nullable(),
  age_years: z.number().min(0).max(50).nullable(),
  weight_kg: z.number().min(0).max(200).nullable(),
  sex: PetSexSchema.nullable(),
  neutered: z.boolean().nullable(),
  indoor_outdoor: PetLifestyleSchema.nullable(),
  diet: PetDietSchema.nullable(),
  size_class: PetSizeClassSchema.nullable(),
  walk_activity: PetWalkActivitySchema.nullable(),
  allergies: stringList,
  vaccinated: z.boolean().nullable(),
  chronic_conditions: stringList,
  medications: stringList,
  notes: z.string().max(NOTES_MAX).nullable(),
  created_at: IsoDateTimeSchema,
})

export type Pet = z.infer<typeof PetSchema>

const petWritableFields = {
  species: PetSpeciesSchema,
  name: z.string().min(1).max(NAME_MAX),
  breed: z.string().max(BREED_MAX).nullable(),
  age_years: z.number().min(0).max(50).nullable(),
  weight_kg: z.number().min(0).max(200).nullable(),
  sex: PetSexSchema.nullable(),
  neutered: z.boolean().nullable(),
  indoor_outdoor: PetLifestyleSchema.nullable(),
  diet: PetDietSchema.nullable(),
  size_class: PetSizeClassSchema.nullable(),
  walk_activity: PetWalkActivitySchema.nullable(),
  allergies: stringList,
  vaccinated: z.boolean().nullable(),
  chronic_conditions: stringList,
  medications: stringList,
  notes: z.string().max(NOTES_MAX).nullable(),
}

// size_class and walk_activity describe dogs only; the database keeps them null
// for cats, so accepting them for a cat would silently drop data.
function rejectDogFieldsOnCats(
  value: { species?: unknown; size_class?: unknown; walk_activity?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (value.species !== 'cat') return

  for (const field of ['size_class', 'walk_activity'] as const) {
    if (value[field] != null) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} applies to dogs only`,
      })
    }
  }
}

/**
 * Creating a pet. Strict, so `user_id` or `id` in the body is an error rather
 * than something a handler has to remember to strip.
 */
export const PetCreateInputSchema = z
  .strictObject(petWritableFields)
  .partial({
    breed: true,
    age_years: true,
    weight_kg: true,
    sex: true,
    neutered: true,
    indoor_outdoor: true,
    diet: true,
    size_class: true,
    walk_activity: true,
    allergies: true,
    vaccinated: true,
    chronic_conditions: true,
    medications: true,
    notes: true,
  })
  .superRefine(rejectDogFieldsOnCats)

export type PetCreateInput = z.infer<typeof PetCreateInputSchema>

export const PetUpdateInputSchema = z
  .strictObject(petWritableFields)
  .partial()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'at least one field is required' })
      return
    }
    rejectDogFieldsOnCats(value, ctx)
  })

export type PetUpdateInput = z.infer<typeof PetUpdateInputSchema>
