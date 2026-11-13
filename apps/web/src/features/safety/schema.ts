import { z } from 'zod'

/**
 * The «Можно ли» reference, as it is kept in `apps/web/content/safety/` — one
 * JSON file per entry, Russian and English side by side so the two languages
 * cannot drift apart on a verdict (docs/superpowers/specs/2026-11-13-pet-safety-design.md).
 *
 * The rules that tie the fields together live in the schema itself, not only
 * in a test: a file that says «danger» but «nothing to do if eaten» must not
 * reach the build, the API or the phone.
 */

export const SAFETY_CATEGORIES = ['food', 'plant', 'medicine', 'household'] as const
export const SAFETY_VERDICTS = ['safe', 'caution', 'danger'] as const
/** `call_now`: call a clinic without waiting for signs; `watch`: watch, check symptoms if signs appear. */
export const SAFETY_IF_EATEN = ['call_now', 'watch', 'none'] as const

/**
 * The English pairs of `FORBIDDEN_WORDS` (seo-content/schema.ts), matched the
 * same way: as word starts, case-insensitively, in every English text.
 */
export const SAFETY_FORBIDDEN_WORDS_EN: readonly string[] = ['diagnos', 'prescrib', 'mg/kg', 'dosage']

const SPECIES = ['cat', 'dog'] as const

const text = z.string().trim().min(1)
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'латиница, цифры и дефисы')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

const localized = z.object({ ru: text, en: text })
const localizedList = z.object({ ru: z.array(text), en: z.array(text) })
const emptyList = () => ({ ru: [], en: [] })

const section = z.object({
  verdict: z.enum(SAFETY_VERDICTS),
  /** One or two sentences: the answer itself. */
  summary: localized,
  /** Why; for `caution`, on what conditions (no pits, no salt, rarely) — never grams. */
  why: localized,
  /** At least two per language for `danger`. */
  signs: localizedList.default(emptyList),
  ifEaten: z.enum(SAFETY_IF_EATEN),
})

/** As for the articles: drafted by a model, checked by agents, published by the owner. */
const review = z.object({
  status: z.enum(['draft', 'agent_reviewed', 'published']),
  draftedBy: z.literal('model'),
  reviewedBy: z.literal('agent').optional(),
  reviewedAt: isoDate.optional(),
  nextReviewAt: isoDate.optional(),
})

const source = z.object({ title: text, url: z.url().optional() })

export const safetyEntrySchema = z
  .object({
    slug,
    category: z.enum(SAFETY_CATEGORIES),
    name: localized,
    /** Other names and word forms the entry is found by; allergen foods also in the accusative («курицу»). */
    aliases: localizedList,
    bySpecies: z.object({ cat: section, dog: section }),
    firstSteps: localizedList.default(emptyList),
    avoid: localizedList.default(emptyList),
    /** The /otravlenie page on the same topic, if there is one. */
    toxinSlug: slug.optional(),
    sources: z.array(source).min(1).max(3),
    review,
  })
  .superRefine((entry, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })

    for (const species of SPECIES) {
      const { verdict, ifEaten, signs } = entry.bySpecies[species]
      const at = ['bySpecies', species]
      if (verdict === 'danger' && ifEaten !== 'call_now') issue([...at, 'ifEaten'], 'danger ⇒ call_now')
      if (verdict === 'safe' && ifEaten !== 'none') issue([...at, 'ifEaten'], 'safe ⇒ none')
      if (verdict === 'danger' && (signs.ru.length < 2 || signs.en.length < 2)) issue([...at, 'signs'], 'danger ⇒ хотя бы два признака на каждом языке')
      // Owner's decision №9: a human medicine is always dangerous, a household substance never safe.
      if (entry.category === 'medicine' && verdict !== 'danger') issue([...at, 'verdict'], 'лекарство — только danger')
      if (entry.category === 'household' && verdict === 'safe') issue([...at, 'verdict'], 'бытовое вещество не бывает safe')
    }

    if (SPECIES.some(species => entry.bySpecies[species].ifEaten !== 'none')) {
      for (const field of ['firstSteps', 'avoid'] as const) {
        for (const locale of ['ru', 'en'] as const) {
          if (entry[field][locale].length === 0) issue([field, locale], 'нужно, если хоть у одного вида ifEaten ≠ none')
        }
      }
    }
  })

export type SafetyEntry = z.infer<typeof safetyEntrySchema>
export type SafetyCategory = SafetyEntry['category']
export type SafetyVerdict = SafetyEntry['bySpecies']['cat']['verdict']

/** Every prose string of an entry in one language, for the wording checks. Sources are titles, not prose. */
export function textsOfEntry(entry: SafetyEntry, locale: 'ru' | 'en'): string[] {
  return [
    entry.name[locale],
    ...entry.aliases[locale],
    ...SPECIES.flatMap(species => {
      const s = entry.bySpecies[species]
      return [s.summary[locale], s.why[locale], ...s.signs[locale]]
    }),
    ...entry.firstSteps[locale],
    ...entry.avoid[locale],
  ]
}
