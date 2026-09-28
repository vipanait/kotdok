/**
 * Which confirmation the pets list or the overview shows after the pet form:
 * a new pet or a deleted one. A saved edit returns to the pet's record and
 * is confirmed there (`?saved=form`, pet-form-exit.ts).
 */
export type PetSavedKind = 'created' | 'deleted'

export function parsePetSaved(value: string | string[] | undefined): PetSavedKind | null {
  return value === 'created' || value === 'deleted' ? value : null
}
