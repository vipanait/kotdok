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
  /** With a pet, its species comes first. */
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

export type SafetyCategory = z.infer<typeof SafetyCategorySchema>
export type SafetyVerdict = z.infer<typeof SafetyVerdictSchema>
export type SafetyIfEaten = z.infer<typeof SafetyIfEatenSchema>
export type SafetyIndexItem = z.infer<typeof SafetyIndexItemSchema>
export type SafetyIndex = z.infer<typeof SafetyIndexSchema>
export type SafetySpeciesSection = z.infer<typeof SafetySpeciesSectionSchema>
export type SafetyPetNote = z.infer<typeof SafetyPetNoteSchema>
export type SafetyItem = z.infer<typeof SafetyItemSchema>
