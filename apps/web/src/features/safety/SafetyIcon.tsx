import Image from 'next/image'
import type { SafetyIconName } from '@lapka/shared'

/** The design sizes (handoff §5): the picture on an entry card, and on a category chip. */
export const SAFETY_ICON_SIZE = { card: 48, chip: 24 } as const

/** Where the picture is served from: `public/images/safety`, copied from docs/design/pet-safety-v1/icons. */
export function safetyIconSrc(name: SafetyIconName): string {
  return `/images/safety/${name}.svg`
}

/**
 * A «Можно ли» item picture. Pick the name with `safetyIconFor(slug, category)`
 * or `safetyCategoryIcon(category)` from @lapka/shared.
 *
 * Decorative: the entry's name next to it is what a screen reader reads, so
 * the picture has an empty alt and is hidden. It keeps the illustration's own
 * colours — it says what the thing is, not whether it is safe.
 */
export default function SafetyIcon({
  name,
  size = 'card',
  className,
}: {
  name: SafetyIconName
  size?: keyof typeof SAFETY_ICON_SIZE
  className?: string
}) {
  const side = SAFETY_ICON_SIZE[size]
  return (
    <Image
      src={safetyIconSrc(name)}
      alt=""
      aria-hidden="true"
      width={side}
      height={side}
      className={className ? `safety-icon ${className}` : 'safety-icon'}
    />
  )
}
