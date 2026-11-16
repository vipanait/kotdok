import type { SafetyPetNote, SafetyVerdict } from '@lapka/contracts'
import { normalizeSafetyQuery } from './match'

/** Whether `phrase` is `term` or holds it as whole words: «курятина, рыба» holds «курятина», «барбарис» does not hold «рис». */
function holdsTerm(phrase: string, term: string): boolean {
  return term !== '' && ` ${phrase} `.includes(` ${term} `)
}

/**
 * The two notes a reference card adds for a particular pet
 * (docs/superpowers/specs/2026-11-13-pet-safety-design.md, «Пометки под
 * питомца»). Nothing else in the pet's profile is read, and the conditions
 * themselves are not interpreted: the card only says «talk to your vet».
 */
export function petSafetyNotes(
  pet: { allergies: readonly string[]; chronic_conditions: readonly string[] },
  item: { name: string; aliases: readonly string[] },
  verdict: SafetyVerdict | 'unknown',
): SafetyPetNote[] {
  const terms = [item.name, ...item.aliases].map(normalizeSafetyQuery)
  const notes: SafetyPetNote[] = pet.allergies
    .filter(allergy => {
      const phrase = normalizeSafetyQuery(allergy)
      return phrase !== '' && terms.some(term => holdsTerm(phrase, term))
    })
    // The owner's own wording, so the card quotes what they wrote.
    .map(allergy => ({ kind: 'allergy', allergy }))

  // «Discuss new foods with your vet» under «Not safe» would read as if it were safe to try.
  if (verdict !== 'danger' && pet.chronic_conditions.some(condition => condition.trim() !== '')) {
    notes.push({ kind: 'chronic' })
  }
  return notes
}
