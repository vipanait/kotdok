import { z } from 'zod'
import { PetSpeciesSchema, UuidSchema } from './primitives'

/**
 * The «Можно ли это питомцу» reference as the API serves it
 * (docs/superpowers/specs/2026-11-13-pet-safety-design.md, «API»): a light
 * index the phone searches itself, and one entry in the account's language.
 *
 * Not strict, like `PetSchema`: a field a later server adds is dropped by an
 * older app, not fatal.
 */

export const SAFETY_CATEGORIES = ['food', 'plant', 'medicine', 'household'] as const
export const SAFETY_VERDICTS = ['safe', 'caution', 'danger'] as const
/** `call_now`: call a clinic without waiting for signs; `watch`: watch, check symptoms if signs appear. */
export const SAFETY_IF_EATEN = ['call_now', 'watch', 'none'] as const

export const SafetyCategorySchema = z.enum(SAFETY_CATEGORIES)
export const SafetyVerdictSchema = z.enum(SAFETY_VERDICTS)
export const SafetyIfEatenSchema = z.enum(SAFETY_IF_EATEN)

/** A search query, in characters: longer is cut by the search and refused by the AI question. */
export const SAFETY_QUERY_MAX = 80

const text = z.string().min(1)

export const SafetyIndexItemSchema = z.object({
  slug: text,
  category: SafetyCategorySchema,
  name: text,
  /** Other names and word forms the entry is found by. */
  aliases: z.array(text),
  verdict: z.object({ cat: SafetyVerdictSchema, dog: SafetyVerdictSchema }),
})

export const SafetyIndexSchema = z.object({ items: z.array(SafetyIndexItemSchema) })

export const SafetySpeciesSectionSchema = z.object({
  verdict: SafetyVerdictSchema,
  summary: text,
  why: text,
  signs: z.array(text),
  if_eaten: SafetyIfEatenSchema,
})

/**
 * What a card adds for a particular pet: an allergy from its profile that
 * names this entry (quoted as the owner wrote it), or «it has chronic
 * conditions, ask your vet» under a verdict that is not already danger.
 */
export const SafetyPetNoteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('allergy'), allergy: text }),
  z.object({ kind: z.literal('chronic') }),
])

export const SafetyItemSchema = z.object({
  slug: text,
  category: SafetyCategorySchema,
  name: text,
  /**
   * Both species. A client puts `pet.species` first: the server sends the
   * pet's section first, but parsing rebuilds the object in this schema's order.
   */
  by_species: z.object({ cat: SafetySpeciesSectionSchema, dog: SafetySpeciesSectionSchema }),
  first_steps: z.array(text),
  avoid: z.array(text),
  /** The site's /otravlenie page on the same topic, if there is one. */
  toxin_slug: text.nullable(),
  sources: z.array(z.object({ title: text, url: z.url().optional() })),
  /** The pet the notes were made for: `pet_id` of the request, when it is the caller's. */
  pet: z.object({ id: UuidSchema, species: PetSpeciesSchema }).nullable(),
  pet_notes: z.array(SafetyPetNoteSchema),
})

/**
 * The AI answer for what the reference does not hold (spec, «Ответ ИИ»).
 * `unknown` — «Нет данных / No data» — exists only here: no reliable
 * information, do not give it.
 */
export const SAFETY_AI_VERDICTS = ['safe', 'caution', 'danger', 'unknown'] as const
export const SafetyAiVerdictSchema = z.enum(SAFETY_AI_VERDICTS)

/**
 * The question: what the pet might eat, and whose species to answer for —
 * one of the caller's pets or a species picked by hand, never both. The query
 * must hold a letter or a digit: punctuation alone normalizes to nothing.
 */
export const SafetyAskInputSchema = z
  .strictObject({
    query: z
      .string()
      .min(1)
      .max(SAFETY_QUERY_MAX)
      .regex(/[\p{L}\p{N}]/u, 'a letter or a digit'),
    pet_id: UuidSchema.optional(),
    species: PetSpeciesSchema.optional(),
  })
  .refine(input => (input.pet_id === undefined) !== (input.species === undefined), {
    message: 'exactly one of pet_id and species',
  })

/**
 * `catalog`: the reference holds it (by the query or by the name the model
 * gave), open that entry. `unrecognized`: not a food, plant or substance; no
 * verdict. `ai`: the model's answer after the server's guards.
 * `remaining_today` is what the daily limit has left after this question;
 * null when the answer came from the cache and spent nothing — the limiter
 * can only tell the remainder while spending — or when the limiter could not
 * be read at all.
 */
export const SafetyAskResultSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('catalog'), slug: text }),
  z.object({ source: z.literal('unrecognized'), remaining_today: z.number().int().min(0).nullable() }),
  z.object({
    source: z.literal('ai'),
    species: PetSpeciesSchema,
    category: SafetyCategorySchema,
    title: text,
    verdict: SafetyAiVerdictSchema,
    summary: text,
    /** May be empty: the model is not made to explain a short answer. */
    why: z.string(),
    signs: z.array(text),
    if_eaten: SafetyIfEatenSchema,
    /** Fixed texts, the same for every AI answer; empty when nothing needs doing. */
    first_steps: z.array(text),
    avoid: z.array(text),
    pet_notes: z.array(SafetyPetNoteSchema),
    remaining_today: z.number().int().min(0).nullable(),
  }),
])

export type SafetyCategory = z.infer<typeof SafetyCategorySchema>
export type SafetyVerdict = z.infer<typeof SafetyVerdictSchema>
export type SafetyIfEaten = z.infer<typeof SafetyIfEatenSchema>
export type SafetyIndexItem = z.infer<typeof SafetyIndexItemSchema>
export type SafetyIndex = z.infer<typeof SafetyIndexSchema>
export type SafetySpeciesSection = z.infer<typeof SafetySpeciesSectionSchema>
export type SafetyPetNote = z.infer<typeof SafetyPetNoteSchema>
export type SafetyItem = z.infer<typeof SafetyItemSchema>
export type SafetyAiVerdict = z.infer<typeof SafetyAiVerdictSchema>
export type SafetyAskInput = z.infer<typeof SafetyAskInputSchema>
export type SafetyAskResult = z.infer<typeof SafetyAskResultSchema>
