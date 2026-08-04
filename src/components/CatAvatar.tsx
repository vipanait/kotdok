import PetAvatar from '@/components/PetAvatar'

interface Props {
  /** Outer diameter in px. Defaults to 40. */
  size?: number
  /** Background tint. Defaults to a peach that matches the cabinet design. */
  bg?: string
  className?: string
}

/** @deprecated Use PetAvatar */
export default function CatAvatar(props: Props) {
  return <PetAvatar {...props} species="cat" />
}
