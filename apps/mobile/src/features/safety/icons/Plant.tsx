import { Path } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** plant.svg: plants by default. */
export function Plant({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Path fill="#E8AF73" d="m15 29 3 15h15l3-15Z" />
      <Path d="M12 29h27M25 28V11" />
      <Path fill="#B8D8B6" d="M25 22C12 24 9 15 10 10c9 0 16 3 15 12ZM25 17C25 7 33 5 40 7c-1 7-6 12-15 10Z" />
    </IconFrame>
  )
}
