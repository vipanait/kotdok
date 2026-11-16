import { Path, Rect } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** chocolate.svg: `shokolad`. */
export function Chocolate({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Rect x={12} y={6} width={27} height={38} rx={4} fill="#B98B6B" />
      <Path d="M25 7v37M13 19h25M13 31h25" />
      <Path fill="#E8DECB" d="m8 30 15 7 19-9-4 18H12Z" />
    </IconFrame>
  )
}
