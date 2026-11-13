/**
 * Whom a «Можно ли?» question is about: one of the person's pets — whose
 * species picks the verdict and whose profile the server reads for notes —
 * or, with no pets, a species chosen by hand.
 */

import type { Pet, PetSpecies } from '@lapka/contracts'

export type SafetySubject =
  | { kind: 'pet'; petId: string; name: string; species: PetSpecies }
  | { kind: 'species'; species: PetSpecies }

export function subjectOfPet(pet: Pet): SafetySubject {
  return { kind: 'pet', petId: pet.id, name: pet.name, species: pet.species }
}

/**
 * The pet chosen last time, while it still exists; otherwise the first pet;
 * with no pets, a cat — the switch beside it turns that into a dog.
 */
export function defaultSubject(pets: readonly Pet[], lastPetId: string | null): SafetySubject {
  const last = lastPetId ? pets.find((pet) => pet.id === lastPetId) : undefined
  const pet = last ?? pets[0]
  return pet ? subjectOfPet(pet) : { kind: 'species', species: 'cat' }
}

export function subjectSpecies(subject: SafetySubject): PetSpecies {
  return subject.species
}

/** The pet id to send, when there is one: the server reads its species and its profile for notes. */
export function subjectPetId(subject: SafetySubject): string | null {
  return subject.kind === 'pet' ? subject.petId : null
}
