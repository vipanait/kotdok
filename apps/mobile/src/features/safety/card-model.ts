/**
 * What a «Можно ли?» card draws, the same shape for a reference entry and
 * for an AI answer, so the two cannot drift apart on screen — except where
 * they must: the AI card is marked, has no sources and no second species.
 */

import type {
  PetSpecies,
  SafetyAiVerdict,
  SafetyAskResult,
  SafetyIfEaten,
  SafetyIndexItem,
  SafetyItem,
  SafetyPetNote,
  SafetyVerdict,
} from '@lapka/contracts'
import { verdictLabelKey, type SafetyVerdictLabelKey } from '@lapka/shared'

export type SafetyCardModel = {
  title: string
  fromAi: boolean
  verdict: SafetyAiVerdict
  label: SafetyVerdictLabelKey
  /** «Лекарства для людей не давайте питомцу без назначения врача» under the verdict. */
  medicineLine: boolean
  summary: string
  why: string
  signs: string[]
  ifEaten: SafetyIfEaten
  firstSteps: string[]
  avoid: string[]
  notes: SafetyPetNote[]
  /** The verdict for the species not asked about, folded under the card, captioned by the same category. */
  otherSpecies: { species: PetSpecies; verdict: SafetyVerdict; label: SafetyVerdictLabelKey } | null
  /** A link where the reference has one; a title alone otherwise. */
  sources: { title: string; url?: string }[]
}

const OTHER: Record<PetSpecies, PetSpecies> = { cat: 'dog', dog: 'cat' }

/**
 * By `species` and never by the order of `by_species`: parsing rebuilds the
 * object in the schema's order, so «the first section» is always the cat's.
 */
export function cardFromItem(item: SafetyItem, species: PetSpecies): SafetyCardModel {
  const section = item.by_species[species]
  const other = OTHER[species]
  return {
    title: item.name,
    fromAi: false,
    verdict: section.verdict,
    label: verdictLabelKey(item.category, section.verdict),
    medicineLine: item.category === 'medicine',
    summary: section.summary,
    why: section.why,
    signs: section.signs,
    ifEaten: section.if_eaten,
    firstSteps: item.first_steps,
    avoid: item.avoid,
    notes: item.pet_notes,
    otherSpecies: {
      species: other,
      verdict: item.by_species[other].verdict,
      label: verdictLabelKey(item.category, item.by_species[other].verdict),
    },
    sources: item.sources.map((source) => (source.url ? { title: source.title, url: source.url } : { title: source.title })),
  }
}

export function cardFromAi(answer: Extract<SafetyAskResult, { source: 'ai' }>): SafetyCardModel {
  return {
    title: answer.title,
    fromAi: true,
    verdict: answer.verdict,
    label: verdictLabelKey(answer.category, answer.verdict),
    medicineLine: answer.category === 'medicine',
    summary: answer.summary,
    why: answer.why,
    signs: answer.signs,
    ifEaten: answer.if_eaten,
    firstSteps: answer.first_steps,
    avoid: answer.avoid,
    notes: answer.pet_notes,
    otherSpecies: null,
    sources: [],
  }
}

/**
 * What the entry screen shows before the server's answer: the index's name
 * and, while loading, its verdict as a placeholder. The index may be a day
 * old, so once loading failed its verdict goes — a stale verdict next to an
 * error would read as the answer.
 */
export function entryPlaceholder(
  known: SafetyIndexItem | undefined,
  species: PetSpecies,
  failed: boolean,
): { title: string | undefined; verdict: { verdict: SafetyVerdict; label: SafetyVerdictLabelKey } | null } {
  if (!known) return { title: undefined, verdict: null }
  if (failed) return { title: known.name, verdict: null }
  const verdict = known.verdict[species]
  return { title: known.name, verdict: { verdict, label: verdictLabelKey(known.category, verdict) } }
}

/**
 * The parts of a card, top to bottom (pet-safety-v1 handoff §7).
 *
 * - An allergy from the pet's profile stands above the verdict: «Можно» must
 *   not be read first and the allergy after it. The general chronic note
 *   keeps its place under the verdict.
 * - What to do if it was already eaten comes before the explanation, so
 *   «call the clinic now» is seen before a paragraph about why.
 * - The notes belong to the pet: with no pet named (a species, or the other
 *   species folded under a pet's card) there are none.
 * - «Можно попробовать иначе» only under an AI «Нет данных», after the
 *   actions — never in their place.
 */
export type SafetyCardBlock =
  | 'allergy'
  | 'verdict'
  | 'chronic'
  | 'ifEaten'
  | 'refine'
  | 'why'
  | 'signs'
  | 'otherSpecies'
  | 'sources'

export function cardBlocks(model: SafetyCardModel, petName: string | null): SafetyCardBlock[] {
  const blocks: SafetyCardBlock[] = []
  const notes = petName ? model.notes : []
  if (notes.some((note) => note.kind === 'allergy')) blocks.push('allergy')
  blocks.push('verdict')
  if (notes.some((note) => note.kind === 'chronic')) blocks.push('chronic')
  if (model.ifEaten !== 'none') blocks.push('ifEaten')
  if (model.fromAi && model.verdict === 'unknown') blocks.push('refine')
  if (model.why) blocks.push('why')
  if (model.signs.length > 0) blocks.push('signs')
  if (model.otherSpecies) blocks.push('otherSpecies')
  if (model.sources.length > 0) blocks.push('sources')
  return blocks
}

/**
 * The other species, folded open on an entry, belongs to that entry for that
 * pet. The screen can be reused for another entry or pet (a deep link, the
 * recent list) with its state kept, so the flip remembers what it was made
 * for and gives way to the asked species anywhere else.
 */
export type SpeciesFlip = { view: string; species: PetSpecies } | null

export function entryView(slug: string, asked: PetSpecies, petId: string | null): string {
  return `${slug}|${asked}|${petId ?? ''}`
}

export function shownSpecies(flip: SpeciesFlip, view: string, asked: PetSpecies): PetSpecies {
  return flip?.view === view ? flip.species : asked
}
