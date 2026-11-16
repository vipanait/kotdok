import type { ComponentType } from 'react'
import { View } from 'react-native'
import type { SafetyIconName } from '@lapka/shared'
import { Apple } from './Apple'
import { Chocolate } from './Chocolate'
import { Flower } from './Flower'
import type { SafetyIconProps } from './frame'
import { Grapes } from './Grapes'
import { Household } from './Household'
import { Medicine } from './Medicine'
import { Milk } from './Milk'
import { Pills } from './Pills'
import { Plant } from './Plant'
/** The design sizes (pet-safety-v1 handoff §5): the picture on an entry card, and on a category chip. */
export const SAFETY_ICON_SIZE = { card: 48, chip: 24 } as const

const ICONS: Record<SafetyIconName, ComponentType<SafetyIconProps>> = {
  apple: Apple,
  plant: Plant,
  medicine: Medicine,
  household: Household,
  chocolate: Chocolate,
  grapes: Grapes,
  milk: Milk,
  flower: Flower,
  pills: Pills,
}

/**
 * A «Можно ли» item picture, drawn natively from the designer's SVGs (served copy: apps/web/public/images/safety).
 * Pick the name with `safetyIconFor(slug, category)` or
 * `safetyCategoryIcon(category)` from @lapka/shared; `size` is a number of
 * points, `SAFETY_ICON_SIZE.card` (48) or `.chip` (24) as the design has it.
 *
 * Decorative and hidden from VoiceOver and TalkBack: the entry's name beside it
 * is what is read. It keeps the illustration's colours whatever the verdict.
 */
export function SafetyIcon({ name, size = SAFETY_ICON_SIZE.card }: { name: SafetyIconName; size?: number }) {
  const Picture = ICONS[name]
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, pointerEvents: 'none' }}
    >
      <Picture size={size} />
    </View>
  )
}
