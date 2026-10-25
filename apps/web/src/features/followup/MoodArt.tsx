import Image, { type StaticImageData } from 'next/image'
import type { FollowupState } from '@lapka/contracts'
import catBetter from '@/assets/illustrations/mood-cat-better.png'
import catSame from '@/assets/illustrations/mood-cat-same.png'
import catWorse from '@/assets/illustrations/mood-cat-worse.png'
import dogBetter from '@/assets/illustrations/mood-dog-better.png'
import dogSame from '@/assets/illustrations/mood-dog-same.png'
import dogWorse from '@/assets/illustrations/mood-dog-worse.png'

/**
 * The answers' drawings (docs/design/followup-loop-v1/assets/pet-moods.png,
 * cut into its six cells without retouching): a cat or a dog, better, the
 * same or worse. Decorative — the answer is named by its text.
 */
const MOODS: Record<'cat' | 'dog', Record<FollowupState, StaticImageData>> = {
  cat: { better: catBetter, same: catSame, worse: catWorse },
  dog: { better: dogBetter, same: dogSame, worse: dogWorse },
}

export default function MoodArt({ species, state, size }: { species: string | null | undefined; state: FollowupState; size: number }) {
  // A species the drawings do not know gets none rather than a random cat.
  if (species !== 'cat' && species !== 'dog') return null
  return (
    <Image
      src={MOODS[species][state]}
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      className="mood-art"
      style={{ width: size, height: size }}
    />
  )
}
