import type { ImageSourcePropType } from 'react-native'
import type { FollowupState, PetSpecies } from '@lapka/contracts'

/** The pet's face for each answer: cat or dog, by the pet's species (design, `pet-moods.png`). */
export const MOODS: Record<PetSpecies, Record<FollowupState, ImageSourcePropType>> = {
  cat: {
    better: require('../../../assets/art/moods/cat-better.png'),
    same: require('../../../assets/art/moods/cat-same.png'),
    worse: require('../../../assets/art/moods/cat-worse.png'),
  },
  dog: {
    better: require('../../../assets/art/moods/dog-better.png'),
    same: require('../../../assets/art/moods/dog-same.png'),
    worse: require('../../../assets/art/moods/dog-worse.png'),
  },
}
