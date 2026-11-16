import { Path } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** apple.svg: food by default, and the apple itself. */
export function Apple({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Path fill="#E8AF73" d="M23 19C9 12 8 32 16 41c4 5 6 0 10 1 5 3 9-1 12-9 5-15-7-19-15-14Z" />
      <Path d="M24 20c-2-7 0-10 3-13" />
      <Path fill="#B8D8B6" d="M27 13c1-7 7-8 12-7-1 6-5 10-12 7Z" />
    </IconFrame>
  )
}
