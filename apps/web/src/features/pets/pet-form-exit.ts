import { recordCache } from '@/features/medical-record/record-load'
import { medicalRecordHref } from '@/features/medical-record/stage'
import type { PetSavedKind } from '@/features/pets/pet-saved'

/** The pets list: where a new pet's form starts from and returns to. */
export const PETS_LIST_HREF = '/pets'

/** `?saved=` the record reads after the pet form of an existing pet was saved. */
export const RECORD_FORM_SAVED = 'form'

/**
 * Where «Отмена» of the pet form leads: an existing pet's form was opened from
 * its record and goes back there; a new pet's from the list.
 */
export function petFormCancelHref(petId?: string): string {
  return petId ? medicalRecordHref.record(petId) : PETS_LIST_HREF
}

/**
 * The way out of the pet form once the server accepted it, with its one-time
 * confirmation. An edit returns to the record it was opened from; a new pet
 * and a deleted one go to the list. A saved or deleted pet's record kept in
 * this tab is forgotten first: the form changes the allergies, conditions,
 * weight and «Принимает сейчас» the record shows, and the record must not
 * draw the ones from before the save while it reloads.
 */
export function petFormDoneHref(kind: PetSavedKind, petId?: string): string {
  if (petId) recordCache.forget(petId)
  if (kind === 'updated' && petId) return `${medicalRecordHref.record(petId)}?saved=${RECORD_FORM_SAVED}`
  return `${PETS_LIST_HREF}?petSaved=${kind}`
}

/** `?saved=` of the record page, read strictly: only the pet form's confirmation. */
export function parseRecordSaved(value: string | string[] | undefined): boolean {
  return value === RECORD_FORM_SAVED
}
