/** Which confirmation the pets list or the overview shows after the pet form. */
export type PetSavedKind = 'created' | 'updated' | 'deleted'

export function parsePetSaved(value: string | string[] | undefined): PetSavedKind | null {
  return value === 'created' || value === 'updated' || value === 'deleted' ? value : null
}
