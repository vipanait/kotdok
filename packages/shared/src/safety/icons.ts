import type { SafetyCategory } from '@lapka/contracts'

/**
 * The «Можно ли» item pictures (docs/design/pet-safety-v1/icons, handoff §5).
 * Only the names live here; each app draws them its own way — the site from
 * SVG files, the app from react-native-svg components.
 *
 * A picture says what the thing is, never whether it is safe: it is not
 * recoloured by verdict and is hidden from a screen reader, which reads the
 * entry's name instead.
 */
export const SAFETY_ICON_NAMES = [
  'apple',
  'plant',
  'medicine',
  'household',
  'chocolate',
  'grapes',
  'milk',
  'flower',
  'pills',
] as const

export type SafetyIconName = (typeof SAFETY_ICON_NAMES)[number]

const BY_CATEGORY: Record<SafetyCategory, SafetyIconName> = {
  food: 'apple',
  plant: 'plant',
  medicine: 'medicine',
  household: 'household',
}

/** The entries the design drew a picture of their own. */
const BY_SLUG: ReadonlyMap<string, SafetyIconName> = new Map([
  ['shokolad', 'chocolate'],
  ['vinograd', 'grapes'],
  ['moloko', 'milk'],
  ['liliya', 'flower'],
  ['ibuprofen', 'pills'],
  ['paracetamol', 'medicine'],
  ['yabloko', 'apple'],
])

/** The picture of a category: its chip, and any entry without one of its own. */
export function safetyCategoryIcon(category: SafetyCategory): SafetyIconName {
  return BY_CATEGORY[category]
}

/** The picture of an entry: its own if the design drew one, otherwise its category's. */
export function safetyIconFor(slug: string, category: SafetyCategory): SafetyIconName {
  return BY_SLUG.get(slug) ?? safetyCategoryIcon(category)
}
