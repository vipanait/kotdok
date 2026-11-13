import 'server-only'

import OpenAI from 'openai'
import {
  SAFETY_AI_VERDICTS,
  SAFETY_CATEGORIES,
  type PetSpecies,
  type SafetyAiVerdict,
  type SafetyAskResult,
  type SafetyCategory,
  type SafetyIfEaten,
} from '@lapka/contracts'
import { matchSafety, normalizeSafetyQuery, petSafetyNotes } from '@lapka/shared'
import { safetyIndex } from '@/features/safety/load'
import { safetyWordingProblems } from '@/features/safety/schema'
import { consumeRateLimit } from '@/server/api/rate-limit'
import type { createServiceClient } from '@/server/supabase/server'
import type { Locale } from '@/shared/i18n/config'
import {
  SAFETY_AI_FORBIDDEN_WORDS,
  SAFETY_AI_NEGATED,
  SAFETY_AVOID,
  SAFETY_FIRST_STEPS,
  SAFETY_NO_DATA,
  safetySystemPrompt,
  safetyUserMessage,
} from './ask-language'
import { loadSafetyPet, type SafetyPet } from './safety-pet'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * «Спросить ИИ» for what the «Можно ли» reference does not hold
 * (docs/superpowers/specs/2026-11-13-pet-safety-design.md, «Ответ ИИ»).
 *
 * A wrong «safe» is the harm the feature exists to prevent, so the model's
 * answer is only a draft: the server decides what is shown. The reference
 * wins whenever it holds the item, by the query or by the name the model
 * gives; a «safe» needs a knowledge-base fragment; medicines are dangerous
 * and household substances never safe; a text that reads like treatment is
 * replaced. Answers are cached for everyone for 30 days.
 */

export const SAFETY_CACHE_DAYS = 30
/** One attempt of at most 30 s, inside the route's `maxDuration` of 60. */
export const SAFETY_MODEL_TIMEOUT_MS = 30_000
/** The models of the symptom check (analyze-symptom-check.ts). */
export const SAFETY_CHAT_MODEL = 'gpt-5.4'
const EMBEDDING_MODEL = 'text-embedding-3-small'
/**
 * A knowledge-base fragment backs an answer only above this cosine
 * similarity — the symptom check's cut-off. Not yet checked against
 * queries the base does not cover (docs/verification/safety-03.md).
 */
export const SAFETY_SIMILARITY_THRESHOLD = 0.3
const KNOWLEDGE_FRAGMENTS = 5

const TITLE_MAX = 80
const SIGNS_MAX = 8
const SIGN_MAX = 200

/**
 * Its own client rather than the symptom check's: that one tries twice for a
 * minute each, longer than this route may run. Built on first use, so the
 * module imports without a key.
 */
let openaiClient: OpenAI | null = null
function openai(): OpenAI {
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: SAFETY_MODEL_TIMEOUT_MS, maxRetries: 0 })
  return openaiClient
}

/** A model's answer after the guards: what may be shown and cached. */
export type GuardedAnswer = {
  recognized: true
  category: SafetyCategory
  verdict: SafetyAiVerdict
  title: string
  summary: string
  why: string
  signs: string[]
  if_eaten: SafetyIfEaten
  canonical_name_ru: string
  canonical_name_en: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function capitalized(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

/** What to do if eaten follows the verdict, not the model: «danger» is always «call now». */
function ifEatenFor(verdict: SafetyAiVerdict, said: unknown): SafetyIfEaten {
  if (verdict === 'danger') return 'call_now'
  if (verdict === 'safe') return 'none'
  if (verdict === 'unknown') return 'watch'
  // «With caution» always leaves something to do: when in doubt, stricter.
  return said === 'call_now' ? 'call_now' : 'watch'
}

const AI_WORD_PATTERNS = SAFETY_AI_FORBIDDEN_WORDS.map(({ word, whole }) => ({
  word,
  // The letters a word is made of, as in `forbiddenWordPattern`: a match must start (and, if whole, end) a word.
  pattern: new RegExp(`(^|[^а-яёa-z])${word}${whole ? '(?![а-яёa-z])' : ''}`, 'i'),
}))

/**
 * What is wrong with a model's texts. Both languages' rules on every text,
 * whatever the account's language: the prompt is in English, and a model
 * that answers a Russian account in English must not slip past the Russian
 * list. Then the AI-only words, with negated advice cut out first.
 */
export function aiWordingProblems(texts: readonly string[]): string[] {
  const unnegated = texts.map(t => t.replace(SAFETY_AI_NEGATED, '$1'))
  return [
    ...safetyWordingProblems(texts, 'ru'),
    ...safetyWordingProblems(texts, 'en'),
    ...AI_WORD_PATTERNS.filter(({ pattern }) => unnegated.some(t => pattern.test(t))).map(({ word }) => word),
  ]
}

/**
 * The server's rules over a model's answer. Throws on an answer it cannot
 * read (a verdict or category outside the four, no title or summary): that is
 * a model failure, not something to show. Every rule can only make the
 * answer stricter.
 */
export function guardAiAnswer(raw: unknown, ctx: { grounded: boolean; locale: Locale }): GuardedAnswer | { recognized: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The model did not return an object')
  const r = raw as Record<string, unknown>
  // Before the other fields: a refusal need not fill them.
  if (r.recognized !== true) return { recognized: false }

  const category = r.category as SafetyCategory
  if (!SAFETY_CATEGORIES.includes(category)) throw new Error(`Unknown category: ${String(r.category)}`)
  let verdict = r.verdict as SafetyAiVerdict
  if (!SAFETY_AI_VERDICTS.includes(verdict)) throw new Error(`Unknown verdict: ${String(r.verdict)}`)
  let title = text(r.title).slice(0, TITLE_MAX).trim()
  let summary = text(r.summary)
  if (!title || !summary) throw new Error('The answer has no title or summary')
  let why = text(r.why)
  let signs = (Array.isArray(r.signs) ? r.signs : [])
    .map(text)
    .filter(sign => sign !== '')
    .slice(0, SIGNS_MAX)
    .map(sign => sign.slice(0, SIGN_MAX))
  const canonicalRu = text(r.canonical_name_ru).slice(0, TITLE_MAX)
  const canonicalEn = text(r.canonical_name_en).slice(0, TITLE_MAX)

  // Owner's decision №9, as for the reference: a human medicine is always dangerous, a household substance never safe.
  if (category === 'medicine') verdict = 'danger'
  else if (category === 'household' && verdict === 'safe') verdict = 'unknown'
  // «Safe» from the model's memory alone is the answer this feature must not give.
  if (verdict === 'safe' && !ctx.grounded) verdict = 'unknown'

  if (aiWordingProblems([title, summary, why, ...signs]).length > 0) {
    // Nothing of the model's text survives: a dose or «make it vomit» must not reach the screen in any field.
    const noData = SAFETY_NO_DATA[ctx.locale]
    const name = ctx.locale === 'ru' ? canonicalRu : canonicalEn
    verdict = category === 'medicine' ? 'danger' : 'unknown'
    title = name && aiWordingProblems([name]).length === 0 ? capitalized(name) : noData.title
    summary = noData.summary
    why = noData.why
    signs = []
  }

  return {
    recognized: true,
    category,
    verdict,
    title,
    summary,
    why,
    signs,
    if_eaten: ifEatenFor(verdict, r.if_eaten),
    canonical_name_ru: canonicalRu,
    canonical_name_en: canonicalEn,
  }
}

/** The reference entry one of these names finds, in either language's index. */
function catalogSlug(names: readonly string[]): string | null {
  for (const name of names) {
    if (!name) continue
    for (const locale of ['ru', 'en'] as const) {
      const exact = matchSafety(safetyIndex(locale), name).exact
      if (exact) return exact.slug
    }
  }
  return null
}

/** Knowledge-base fragments for the query; the answer is grounded when one passes the threshold. */
async function vetKnowledge(
  supabase: SupabaseService,
  query: string,
  species: PetSpecies,
): Promise<{ grounded: boolean; context: string }> {
  const embedding = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: query })
  const { data, error } = await supabase.rpc('search_vet_knowledge', {
    query_embedding: embedding.data[0].embedding,
    match_count: KNOWLEDGE_FRAGMENTS,
    filter_species: species,
  })
  if (error) console.error('safety ask: knowledge search failed, answering ungrounded:', error.message)

  const fragments = ((data ?? []) as { similarity: number; source_title: string; content: string }[]).filter(
    row => row.similarity > SAFETY_SIMILARITY_THRESHOLD,
  )
  if (fragments.length === 0) return { grounded: false, context: 'No knowledge-base fragments matched.' }
  return {
    grounded: true,
    context: fragments.map(row => `[${row.source_title}]\n${row.content}`).join('\n\n---\n\n'),
  }
}

async function askModel(supabase: SupabaseService, query: string, species: PetSpecies, locale: Locale) {
  const knowledge = await vetKnowledge(supabase, query, species)
  const completion = await openai().chat.completions.create({
    model: SAFETY_CHAT_MODEL,
    messages: [
      { role: 'system', content: safetySystemPrompt(locale) },
      { role: 'user', content: safetyUserMessage({ species, query, context: knowledge.context }) },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
    max_completion_tokens: 700,
  })
  const content = completion.choices[0]?.message.content
  if (!content) throw new Error('Empty response from the model')
  return guardAiAnswer(JSON.parse(content), { grounded: knowledge.grounded, locale })
}

type CachedRow = { answer: unknown; asked_count: number; created_at: string }

/**
 * The answer as the client gets it. The pet's notes are made for whoever
 * asks, never cached; the fixed lists follow `if_eaten`.
 */
function aiResult(
  answer: GuardedAnswer,
  species: PetSpecies,
  locale: Locale,
  pet: SafetyPet | null,
  remaining: number | null,
): SafetyAskResult {
  const nothingToDo = answer.if_eaten === 'none'
  return {
    source: 'ai',
    species,
    category: answer.category,
    title: answer.title,
    verdict: answer.verdict,
    summary: answer.summary,
    why: answer.why,
    signs: answer.signs,
    if_eaten: answer.if_eaten,
    first_steps: nothingToDo ? [] : [...SAFETY_FIRST_STEPS[locale]],
    avoid: nothingToDo ? [] : [...SAFETY_AVOID[locale]],
    pet_notes: pet
      ? petSafetyNotes(
          pet,
          // Both languages: an allergy is matched in whatever language the owner typed it.
          { name: answer.title, aliases: [answer.canonical_name_ru, answer.canonical_name_en] },
          answer.verdict,
        )
      : [],
    remaining_today: remaining,
  }
}

export async function askSafety(
  supabase: SupabaseService,
  input: { userId: string; query: string; petId?: string; species?: PetSpecies; locale: Locale },
): Promise<{ ok: true; data: SafetyAskResult } | { ok: false; code: 'rate_limited' | 'not_found' | 'internal_error' }> {
  let pet: SafetyPet | null = null
  if (input.petId) {
    const loaded = await loadSafetyPet(supabase, input.userId, input.petId)
    if (!loaded.ok) return { ok: false, code: loaded.reason === 'not_found' ? 'not_found' : 'internal_error' }
    pet = loaded.pet
  }
  const species = pet?.species ?? input.species
  // The contract asks for exactly one of the two, and for a letter or a digit in the query.
  const queryKey = normalizeSafetyQuery(input.query)
  if (!species || !queryKey) return { ok: false, code: 'internal_error' }

  // 1. The reference first: what it holds never reaches the model and costs nothing.
  const listed = catalogSlug([input.query])
  if (listed) return { ok: true, data: { source: 'catalog', slug: listed } }

  // 2. An answer someone got in the last 30 days, for free.
  const key = { query_key: queryKey, species, locale: input.locale }
  const { data: row, error: readError } = await supabase
    .from('safety_ai_answers')
    .select('answer, asked_count, created_at')
    .match(key)
    .maybeSingle<CachedRow>()
  if (readError) console.error('safety ask: cache read failed:', readError.message)
  const fresh = row && Date.now() - new Date(row.created_at).getTime() < SAFETY_CACHE_DAYS * 24 * 60 * 60 * 1000
  if (row && fresh) {
    // Through the guards again, so a rule added later applies to what is already cached.
    let cached: ReturnType<typeof guardAiAnswer> | null = null
    try {
      cached = guardAiAnswer(row.answer, { grounded: true, locale: input.locale })
    } catch (error) {
      console.error('safety ask: unreadable cached answer, asking again:', error)
    }
    if (cached?.recognized) {
      // Read, then write: a lost count under two simultaneous hits is not worth a database function.
      const { error } = await supabase
        .from('safety_ai_answers')
        .update({ asked_count: row.asked_count + 1, last_asked_at: new Date().toISOString() })
        .match(key)
      if (error) console.error('safety ask: cache count failed:', error.message)
      // An entry published after the answer was cached wins over it, as it would have on the first ask.
      const named = catalogSlug([cached.canonical_name_ru, cached.canonical_name_en])
      if (named) return { ok: true, data: { source: 'catalog', slug: named } }
      return { ok: true, data: aiResult(cached, species, input.locale, pet, null) }
    }
  }

  // 3. A model call: one of ten a day.
  const rate = await consumeRateLimit(supabase, 'safety_ask', input.userId)
  if (!rate.allowed) return { ok: false, code: 'rate_limited' }
  // A limiter that failed open knows nothing about the remainder; say so rather than invent ten.
  const remaining = rate.degraded ? null : rate.remaining

  let answer: ReturnType<typeof guardAiAnswer>
  try {
    // The normalized key, not the raw text: one cache row is always the answer to one model input.
    answer = await askModel(supabase, queryKey, species, input.locale)
  } catch (error) {
    // The attempt stays spent: the model was called, and giving it back would complicate the limiter for a rare case.
    console.error('safety ask: model failed:', error)
    return { ok: false, code: 'internal_error' }
  }

  // Not an item, or an instruction dressed as one: no verdict, nothing cached.
  if (!answer.recognized) return { ok: true, data: { source: 'unrecognized', remaining_today: remaining } }

  // The model named something the reference holds («изюмчик» is raisins): the checked entry, not the model's answer.
  const named = catalogSlug([answer.canonical_name_ru, answer.canonical_name_en])
  if (named) return { ok: true, data: { source: 'catalog', slug: named } }

  const now = new Date().toISOString()
  const { error: writeError } = await supabase.from('safety_ai_answers').upsert(
    {
      ...key,
      answer,
      model: SAFETY_CHAT_MODEL,
      // A stale row is replaced; its count carries on, so the log of what is missing keeps counting.
      asked_count: row ? row.asked_count + 1 : 1,
      created_at: now,
      last_asked_at: now,
    },
    { onConflict: 'query_key,species,locale' },
  )
  if (writeError) console.error('safety ask: cache write failed:', writeError.message)

  return { ok: true, data: aiResult(answer, species, input.locale, pet, remaining) }
}
