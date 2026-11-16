import { G, Path, Rect } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** pills.svg: `ibuprofen`. */
export function Pills({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <G transform="rotate(-35 26 26)">
        <Rect x={16} y={6} width={20} height={39} rx={10} fill="#FFFFFF" />
        <Path fill="#E8AF73" d="M16 25h20V16a10 10 0 0 0-20 0Z" />
        <Path d="M16 25h20m5-12v5" />
      </G>
    </IconFrame>
  )
}
