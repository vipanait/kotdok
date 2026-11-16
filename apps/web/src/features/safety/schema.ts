import { z } from 'zod'
// The value sets are the contract's: what a file may say is what the API may serve.
import { SAFETY_CATEGORIES, SAFETY_IF_EATEN, SAFETY_VERDICTS } from '@lapka/contracts'
import { FORBIDDEN_WORDS, forbiddenWordPattern } from '@/features/seo-content/schema'

/**
 * The «Можно ли» reference, as it is kept in `apps/web/content/safety/` — one
 * JSON file per entry, Russian and English side by side so the two languages
 * cannot drift apart on a verdict (docs/superpowers/specs/2026-11-13-pet-safety-design.md).
 *
 * The rules that tie the fields together live in the schema itself, not only
 * in a test: a file that says «danger» but «nothing to do if eaten» must not
 * reach the build, the API or the phone.
 */

/**
 * The English pairs of `FORBIDDEN_WORDS` (seo-content/schema.ts), matched the
 * same way: as word starts, case-insensitively, in every English text.
 */
export const SAFETY_FORBIDDEN_WORDS_EN: readonly string[] = ['diagnos', 'prescrib', 'mg/kg', 'dosage']

/** The one vomiting line the project allows, in either language. `\s`, not a space: the loader puts non-breaking spaces after short words. */
const VET_SAYS_SO = { ru: /только\s+по\s+указанию\s+врача/i, en: /unless\s+a\s+vet\s+tells\s+you\s+to/i } as const

/** Up to three words, no punctuation, between the verb and «рвоту»: «вызовите у питомца рвоту». */
const UP_TO_THREE_WORDS = String.raw`(?:[^\s,.;:!?—–-]+\s+){0,3}`

/** Imperatives: advice whatever the context. */
const RU_IMPERATIVE = new RegExp(String.raw`(?:вызов(?:ите|и)|вызывайте|вызывай|(?:с)?провоцируйте|(?:с)?провоцируй)\s+${UP_TO_THREE_WORDS}рвот`, 'i')
/** Infinitives: advice («нужно вызвать рвоту») unless a description («может вызвать рвоту») or a negation precedes them. */
// The three words before it stay inside the clause: «если собака не ест, нужно вызвать» is not negated.
const RU_INFINITIVE = new RegExp(String.raw`([^\s,.;:!?—–]+\s+)?([^\s,.;:!?—–]+\s+)?([^\s,.;:!?—–]+\s+)?(?:вызвать|вызывать|(?:с)?провоцировать)\s+${UP_TO_THREE_WORDS}рвот`, 'gi')
const RU_DESCRIBES_OR_NEGATES = /^(?:не|нельзя|может|могут|мог|могла|могло|могли|способн[а-яё]*)$/i

const EN_ADVICE = [
  /\binduc\w*\s+(?:\w+\s+){0,2}vomit/i,
  // "make your pet vomit", "make him vomit"; not "makes", which describes.
  /\bmake\s+(?:[\w’']+\s+){0,3}vomit/i,
  // "cause vomiting at home", "Cause your dog to vomit": advice, unlike "can cause vomiting".
  /\bcause\s+(?:[\w’']+\s+){0,3}vomit\w*\s+at\s+home/i,
  /(?:^|[.!?]\s+)cause\s+(?:[\w’']+\s+){0,3}vomit/i,
]

/**
 * Whether a text advises making a pet vomit other than with «only if a vet
 * says so» — the one way the reference may say it (global constraints).
 * Vomiting as a sign is fine: «может вызвать рвоту», «вызывает рвоту и
 * понос», "can cause vomiting". Advice is an imperative («вызовите рвоту»),
 * an infinitive after «нужно / можно / стоит» or with nothing descriptive
 * before it, or "induce vomiting", "make your pet vomit".
 */
export function advisesVomiting(text: string, locale: 'ru' | 'en'): boolean {
  if (VET_SAYS_SO[locale].test(text)) return false
  if (locale === 'en') return EN_ADVICE.some(pattern => pattern.test(text))
  if (RU_IMPERATIVE.test(text)) return true
  for (const match of text.matchAll(RU_INFINITIVE)) {
    const before = [match[1], match[2], match[3]].map(word => word?.trim() ?? '')
    if (!before.some(word => RU_DESCRIBES_OR_NEGATES.test(word))) return true
  }
  return false
}

/**
 * The stricter check an AI answer gets: any «вызыв… / вызов… / провоцир…»
 * next to «рвот…», or "induce / make … vomit", without the vet line. A
 * model's text is not reviewed by hand, so a sign worded like advice is
 * replaced rather than argued with.
 */
export function mentionsInducingVomiting(text: string, locale: 'ru' | 'en'): boolean {
  if (VET_SAYS_SO[locale].test(text)) return false
  return locale === 'ru'
    ? /вызыв|вызов|вызв|провоцир/i.test(text) && /рвот/i.test(text)
    : /induc\w*\s+vomit|make\b[^.]*\bvomit/i.test(text)
}

/**
 * What is wrong with the wording of these texts in one language: the
 * forbidden words found, and `vomiting` for advice to make a pet vomit
 * without «only if a vet says so». Empty when the texts may be shown. The
 * reference's content test uses it as is; the guards on an AI answer pass
 * `strictVomiting`, which also trips on vomiting described as a sign.
 */
export function safetyWordingProblems(
  texts: readonly string[],
  locale: 'ru' | 'en',
  options: { strictVomiting?: boolean } = {},
): string[] {
  const words = locale === 'ru' ? FORBIDDEN_WORDS : SAFETY_FORBIDDEN_WORDS_EN
  const problems: string[] = words.filter(word => texts.some(text => forbiddenWordPattern(word).test(text)))
  const vomiting = options.strictVomiting ? mentionsInducingVomiting : advisesVomiting
  if (texts.some(text => vomiting(text, locale))) problems.push('vomiting')
  return problems
}

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
    /**
     * The name in the accusative, lower case, for the site's question
     * «Можно ли кошкам и собакам <titleRu>?». Without it the page asks
     * «<Название>: можно ли кошкам и собакам».
     */
    titleRu: text.optional(),
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
