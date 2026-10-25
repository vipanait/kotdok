import { z } from 'zod'

/**
 * The articles under /simptomy and /otravlenie, as they are kept in
 * `apps/web/content/` — one JSON file per page (docs/plans/seo-symptom-pages).
 *
 * Structure rather than free text: the signs per urgency level, the questions
 * of «Это срочно?» with the level each one raises, the FAQ and the review
 * status are fields, so the page, its JSON-LD and the quiz are built from one
 * source and a test can see what is missing.
 */

export const SPECIES = ['cat', 'dog'] as const
export type Species = (typeof SPECIES)[number]

/** Groups on the species hubs. */
export const BODY_SYSTEMS = [
  'digestive',
  'urinary',
  'breathing',
  'skin',
  'eyes_ears',
  'mouth',
  'nervous',
  'movement',
  'general',
] as const
export type BodySystem = (typeof BODY_SYSTEMS)[number]

/**
 * Words the pages must not use: the text informs, it does not diagnose or
 * prescribe (the same stance as `DISCLAIMER` in analysis-language.ts). Matched
 * as word starts, case-insensitively, in every text field.
 */
export const FORBIDDEN_WORDS = [
  'диагноз',
  'диагностир',
  'вылечит',
  'вылечить',
  'назначьте',
  'дайте таблетк',
  'мг/кг',
  'дозировк',
] as const

/** A first segment and the species hubs: slugs may not take them. */
export const RESERVED_SLUGS = ['koshki', 'sobaki'] as const

const text = z.string().trim().min(1)
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'латиница, цифры и дефисы')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

/**
 * How a page got here. The text is drafted by a model and checked by a second
 * agent against the urgency rules and the wording rules; the owner publishes
 * by merging. Nobody signs it as a vet, so the page never claims one did.
 */
const review = z.object({
  status: z.enum(['draft', 'agent_reviewed', 'published']),
  draftedBy: z.literal('model'),
  reviewedBy: z.literal('agent').optional(),
  reviewedAt: isoDate.optional(),
  nextReviewAt: isoDate.optional(),
})

/** «Это срочно?»: a yes moves the answer up to this level. */
const quizQuestion = z.object({
  question: text,
  level: z.enum(['emergency', 'urgent']),
})

const faqItem = z.object({ question: text, answer: text })
const source = z.object({ title: text, url: z.url().optional() })

const common = {
  slug,
  locale: z.literal('ru'),
  /** H1. */
  title: text,
  /** `<title>`, before « — Лапка». */
  metaTitle: text.max(60),
  metaDescription: text.max(160),
  /** Under the H1: the answer a searcher came for, in two or three sentences. */
  shortAnswer: text,
  quiz: z.array(quizQuestion).min(5).max(7),
  tellVet: z.array(text).min(3),
  faq: z.array(faqItem).min(3).max(5),
  related: z.array(slug).max(6),
  sources: z.array(source).min(1),
  review,
}

export const symptomPageSchema = z.object({
  ...common,
  kind: z.literal('symptom'),
  species: z.enum(SPECIES),
  /** The same topic for cat and dog (`rvota`), so the two pages can point at each other. */
  topic: slug,
  bodySystem: z.enum(BODY_SYSTEMS),
  /** The short name on hubs and in breadcrumbs: «Рвота». */
  name: text,
  signs: z.object({
    emergency: z.array(text).min(1),
    urgent: z.array(text).min(1),
    monitor: z.array(text).min(1),
    home_care: z.array(text),
    healthy: z.array(text),
  }),
  causesByAge: z.object({
    young: z.array(text).min(1),
    adult: z.array(text).min(1),
    senior: z.array(text).min(1),
  }),
  homeSteps: z.array(text).min(2),
  avoid: z.array(text).min(2),
})

export const toxinPageSchema = z.object({
  ...common,
  kind: z.literal('toxin'),
  /** «Лилия». */
  name: text,
  whereFound: z.array(text).min(1),
  bySpecies: z
    .object({
      cat: z.object({ risk: text, signs: z.array(text).min(2) }).optional(),
      dog: z.object({ risk: text, signs: z.array(text).min(2) }).optional(),
    })
    .refine(value => value.cat || value.dog, 'нужен раздел хотя бы для одного вида'),
  firstSteps: z.array(text).min(2),
  avoid: z.array(text).min(2),
})

export type SymptomPage = z.infer<typeof symptomPageSchema>
export type ToxinPage = z.infer<typeof toxinPageSchema>
export type ContentPage = SymptomPage | ToxinPage

/** Keys whose values are identifiers or enum members, not prose. */
const NOT_PROSE = new Set(['url', 'slug', 'related', 'review', 'kind', 'locale', 'species', 'topic', 'bodySystem', 'level'])

/** Every prose string of a page, for the wording and similarity checks. */
export function textsOf(page: ContentPage): string[] {
  const out: string[] = []
  const walk = (value: unknown, key?: string) => {
    if (key && NOT_PROSE.has(key)) return
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(item => walk(item))
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    }
  }
  walk(page)
  return out
}

/** Forbidden words a page uses, for the content test. */
export function forbiddenWordsIn(page: ContentPage): string[] {
  const texts = textsOf(page).map(t => t.toLowerCase())
  return FORBIDDEN_WORDS.filter(word => {
    const pattern = new RegExp(`(^|[^а-яёa-z])${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'i')
    return texts.some(t => pattern.test(t))
  })
}
