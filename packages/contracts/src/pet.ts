import { z } from 'zod'
import {
  CalendarDateSchema,
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

/**
 * A pet as the API returns it. `user_id` stays server-side.
 *
 * Not strict: a field a later server adds is dropped by an older app, not
 * fatal — the store builds read every pet list with this. The server still
 * builds the object field by field (`toPetContract`), so nothing leaks.
 */
export const PetSchema = z.object({
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
  /** Exact, or the owner's estimate when `birth_date_approx` (FB-2/01). Absent from older servers. */
  birth_date: CalendarDateSchema.nullable().default(null),
  birth_date_approx: z.boolean().default(false),
  /** The first day together. */
  adopted_on: CalendarDateSchema.nullable().default(null),
  /** A short-lived signed link to the pet's photo (FB-4), or none. */
  avatar_url: z.url().nullable().default(null),
  created_at: IsoDateTimeSchema,
})

export type Pet = z.infer<typeof PetSchema>

/**
 * What a client can read, named in one request header (FB-2 release). The
 * store builds from before FB-2 parse pets strictly: a new key fails their
 * whole pet list. The server sends the birth date and the home day only to a
 * client that lists `pet-dates`; the others get the pet as before.
 */
export const FEATURES_HEADER = 'X-Lapka-Features'
export const PET_DATES_FEATURE = 'pet-dates'
export const PET_DATE_FIELDS = ['birth_date', 'birth_date_approx', 'adopted_on'] as const
/** The pet's photo (FB-4): `avatar_url` only for a client that lists it. */
export const PET_AVATAR_FEATURE = 'pet-avatar'

/** Asking to write a pet's photo straight to storage (FB-4); the bytes never pass through the API. */
export const AvatarGrantRequestSchema = z.strictObject({
  content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size_bytes: z.int().min(1).max(5 * 1024 * 1024),
})

export type AvatarGrantRequest = z.infer<typeof AvatarGrantRequestSchema>

export const AvatarGrantSchema = z.strictObject({
  /** Named back in the confirmation; the server checks it is this pet's. */
  path: z.string().min(1).max(200),
  url: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expires_at: IsoDateTimeSchema,
})

export type AvatarGrant = z.infer<typeof AvatarGrantSchema>

export const AvatarConfirmSchema = z.strictObject({ path: z.string().min(1).max(200) })

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
  birth_date: CalendarDateSchema.nullable(),
  birth_date_approx: z.boolean(),
  adopted_on: CalendarDateSchema.nullable(),
  /**
   * The owner's local day, for the weight history: a weight saved from the
   * form is that day's measurement. Not a pet column. Without it the server
   * uses today in UTC.
   */
  weight_measured_on: CalendarDateSchema.optional(),
}

/**
 * The dates in order (FB-2/01): home no earlier than birth, and «approximate»
 * only about a date. Days in the future are the route's to refuse — it knows
 * the server's day, the contract does not.
 */
function checkDates(
  value: { birth_date?: string | null; birth_date_approx?: boolean; adopted_on?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.birth_date && value.adopted_on && value.adopted_on < value.birth_date) {
    ctx.addIssue({ code: 'custom', path: ['adopted_on'], message: 'the pet came home before it was born' })
  }
  if (value.birth_date_approx === true && !value.birth_date) {
    ctx.addIssue({ code: 'custom', path: ['birth_date_approx'], message: 'an approximate birth date needs a date' })
  }
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
    birth_date: true,
    birth_date_approx: true,
    adopted_on: true,
    weight_measured_on: true,
  })
  .superRefine((value, ctx) => {
    rejectDogFieldsOnCats(value, ctx)
    checkDates(value, ctx)
  })

export type PetCreateInput = z.infer<typeof PetCreateInputSchema>

/** Not pet columns: what the form showed when it was opened, set aside from what it sends. */
const FORM_CONTEXT_KEYS = ['weight_measured_on', 'medications_before', 'weight_kg_before']

export const PetUpdateInputSchema = z
  .strictObject({
    ...petWritableFields,
    /**
     * The medicines list the form was opened with. Only names the owner took
     * off it end their courses; a course added in the record since is not on
     * it and stays. Without it the server compares with the current list.
     */
    medications_before: stringList.optional(),
    /** The weight the form was opened with: sent back unchanged, it records nothing. */
    weight_kg_before: z.number().min(0).max(200).nullable().optional(),
  })
  .partial()
  .superRefine((value, ctx) => {
    // The weighing day and what the form was opened with describe the edit; alone they change nothing.
    if (Object.keys(value).filter((key) => !FORM_CONTEXT_KEYS.includes(key)).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'at least one field is required' })
      return
    }
    rejectDogFieldsOnCats(value, ctx)
    checkDates(value, ctx)
  })

export type PetUpdateInput = z.infer<typeof PetUpdateInputSchema>
