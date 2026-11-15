import { Path } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** flower.svg: `liliya`. */
export function Flower({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Path d="M25 43V23" />
      <Path fill="#B8D8B6" d="M25 37c-7 0-12-5-12-11 7 0 11 4 12 11Z" />
      <Path fill="#F4D5C3" d="M25 24C12 29 8 16 15 11c3 0 6 4 6 6-2-10 4-15 8-11 3 3 1 8-1 11 9-8 16-2 11 4-3 4-8 5-14 3Z" />
    </IconFrame>
  )
}
