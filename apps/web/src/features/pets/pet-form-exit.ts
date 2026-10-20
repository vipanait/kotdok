import { recordCache } from '@/features/medical-record/record-load'
import { medicalRecordHref } from '@/features/medical-record/routes'
import type { PetSavedKind } from '@/features/pets/pet-saved'
import { petCreatedHref, type OnboardingGoal } from '@/features/onboarding/onboarding-state'

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
 * confirmation. An edit returns to the record it was opened from; a deleted
 * pet goes to the list. A new pet goes on with the path chosen at the first
 * entry — the check, or «Добавим первую запись?» — and, added the ordinary
 * way, to the optional first steps (design of 20 October 2026). A saved or deleted pet's record kept in
 * this tab is forgotten first: the form changes the allergies, conditions,
 * weight and «Принимает сейчас» the record shows, and the record must not
 * draw the ones from before the save while it reloads.
 */
export function petFormDoneHref(
  done: { kind: 'created'; petId: string; goal: OnboardingGoal | null } | { kind: 'updated' | 'deleted'; petId: string },
): string {
  if (done.kind === 'created') return petCreatedHref(done.goal, done.petId)
  recordCache.forget(done.petId)
  if (done.kind === 'updated') return `${medicalRecordHref.record(done.petId)}?saved=${RECORD_FORM_SAVED}`
  const kind: PetSavedKind = done.kind
  return `${PETS_LIST_HREF}?petSaved=${kind}`
}

/** `?saved=` of the record page, read strictly: only the pet form's confirmation. */
export function parseRecordSaved(value: string | string[] | undefined): boolean {
  return value === RECORD_FORM_SAVED
}
