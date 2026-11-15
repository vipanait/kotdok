import { Circle, G, Path } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** grapes.svg: `vinograd`. */
export function Grapes({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Path d="M25 15V7m0 6c5-7 10-7 14-5" />
      <G fill="#C7B9D5">
        <Circle cx={18} cy={20} r={6} />
        <Circle cx={31} cy={20} r={6} />
        <Circle cx={24} cy={29} r={6} />
        <Circle cx={35} cy={30} r={6} />
        <Circle cx={19} cy={38} r={6} />
        <Circle cx={30} cy={40} r={6} />
      </G>
    </IconFrame>
  )
}
