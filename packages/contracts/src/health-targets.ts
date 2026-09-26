import { z } from 'zod'

/**
 * What a vaccination protects against, by species.
 *
 * `core` marks the vaccinations vets usually recommend for every animal of the
 * species — the block «Основные прививки» (spec §5.4, §7.5). A fixed list, not
 * the catalogue of products (MR-04): those refer to these codes. Names live in
 * the apps' dictionaries.
 */
export const VACCINE_TARGETS = [
  { code: 'panleukopenia', species: ['cat'], core: true },
  { code: 'calicivirus', species: ['cat'], core: true },
  { code: 'rhinotracheitis', species: ['cat'], core: true },
  { code: 'distemper', species: ['dog'], core: true },
  { code: 'parvovirus', species: ['dog'], core: true },
  { code: 'adenovirus', species: ['dog'], core: true },
  { code: 'rabies', species: ['cat', 'dog'], core: true },
  { code: 'felv', species: ['cat'], core: false },
  { code: 'chlamydia', species: ['cat'], core: false },
  { code: 'leptospirosis', species: ['dog'], core: false },
  { code: 'parainfluenza', species: ['dog'], core: false },
  { code: 'bordetella', species: ['dog'], core: false },
  { code: 'coronavirus', species: ['dog'], core: false },
] as const

export type VaccineTarget = (typeof VACCINE_TARGETS)[number]['code']

export const VaccineTargetSchema = z.enum(
  VACCINE_TARGETS.map((target) => target.code) as [VaccineTarget, ...VaccineTarget[]],
)

/**
 * What a treatment protects against. The catalogue keeps the finer codes
 * (ear mites, heartworm); the screens fold every one into three words the
 * owner knows — блохи, клещи, глисты (spec §5.1).
 */
export const PARASITE_TARGETS = [
  { code: 'fleas', group: 'fleas' },
  { code: 'ticks', group: 'ticks' },
  { code: 'ear_mites', group: 'ticks' },
  { code: 'worms', group: 'worms' },
  { code: 'heartworm', group: 'worms' },
] as const

export type ParasiteTarget = (typeof PARASITE_TARGETS)[number]['code']
export type ParasiteGroup = (typeof PARASITE_TARGETS)[number]['group']

export const ParasiteTargetSchema = z.enum(
  PARASITE_TARGETS.map((target) => target.code) as [ParasiteTarget, ...ParasiteTarget[]],
)

/** Any code a record item may carry, whatever its kind; the kind is checked with the record. */
export const HealthTargetSchema = z.union([VaccineTargetSchema, ParasiteTargetSchema])

export type HealthTarget = VaccineTarget | ParasiteTarget
