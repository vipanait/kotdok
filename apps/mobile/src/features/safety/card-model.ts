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
  sources: string[]
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
    sources: item.sources.map((source) => source.title),
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
