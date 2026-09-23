import Image, { type StaticImageData } from 'next/image'
import avatarCat from '@/assets/illustrations/avatar-cat.png'
import avatarDog from '@/assets/illustrations/avatar-dog.png'
import kittenPaw from '@/assets/illustrations/kitten-paw.png'
import paw from '@/assets/illustrations/paw.png'
import petsTogether from '@/assets/illustrations/pets-together.png'
import welcomePets from '@/assets/illustrations/welcome-pets.png'

/**
 * The transparent illustrations shared with the mobile app
 * (docs/design/mobile-concept-v1/assets/transparent), resized for the web.
 *
 * - `pets-together` — the pair in a bed: first pet.
 * - `welcome-pets` — the standing pair: no checks yet, no pet to check, landing.
 * - `paw` — waiting for a result, context boxes.
 * - `avatar-cat` / `avatar-dog` — species placeholders, never a photo of the pet.
 */
const SOURCES = {
  'avatar-cat': avatarCat,
  'avatar-dog': avatarDog,
  'kitten-paw': kittenPaw,
  paw,
  'pets-together': petsTogether,
  'welcome-pets': welcomePets,
} satisfies Record<string, StaticImageData>

export type IllustrationName = keyof typeof SOURCES

export default function Illustration({
  name,
  className = 'art',
  size,
  priority = false,
  fixedSize = false,
}: {
  name: IllustrationName
  className?: string
  /** Rendered width and height in CSS pixels; picks the right file size. */
  size: number
  priority?: boolean
  /** Pin the rendered box to `size`, over whatever the class sets. */
  fixedSize?: boolean
}) {
  return (
    <Image
      src={SOURCES[name]}
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      className={className}
      priority={priority}
      style={fixedSize ? { width: size, height: size } : undefined}
    />
  )
}
