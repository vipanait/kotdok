import Illustration from '@/components/ui/Illustration'
import type { PetSpecies } from '@/shared/types'

interface Props {
  /** Rendered size in px. Defaults to 58, the card avatar of the concept. */
  size?: number
  species?: PetSpecies | null
  className?: string
}

/**
 * Species placeholder for a pet. It stands for "a cat" or "a dog", not for the
 * pet itself, so it is decorative: the name is always written next to it.
 */
export default function PetAvatar({ size = 58, species, className }: Props) {
  return (
    <Illustration
      name={species === 'dog' ? 'avatar-dog' : 'avatar-cat'}
      size={size}
      className={className ? `avatar ${className}` : 'avatar'}
      fixedSize
    />
  )
}
