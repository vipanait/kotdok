import PetPhoto from '@/components/PetPhoto'
import Illustration from '@/components/ui/Illustration'
import type { PetSpecies } from '@/shared/types'

interface Props {
  /** Rendered size in px. Defaults to 58, the card avatar of the concept. */
  size?: number
  species?: PetSpecies | null
  /** The owner's photo of the pet, as a signed link; it wins over the species drawing. */
  photoUrl?: string | null
  className?: string
  /** Pin the box to `size`; off where the stylesheet sizes the avatar. */
  fixedSize?: boolean
}

/**
 * The pet's picture: the owner's photo when there is one, otherwise a species
 * placeholder that stands for "a cat" or "a dog". Either way it is
 * decorative: the name is always written next to it.
 */
export default function PetAvatar({ size = 58, species, photoUrl, className, fixedSize = true }: Props) {
  if (photoUrl) return <PetPhoto url={photoUrl} size={size} species={species} className={className} fixedSize={fixedSize} />
  return (
    <Illustration
      name={species === 'dog' ? 'avatar-dog' : 'avatar-cat'}
      size={size}
      className={className ? `avatar ${className}` : 'avatar'}
      fixedSize={fixedSize}
    />
  )
}
