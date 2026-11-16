import { Path, Rect } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** medicine.svg: medicines by default, and `paracetamol`. */
export function Medicine({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Rect x={13} y={14} width={25} height={30} rx={7} fill="#DDEFEB" />
      <Rect x={16} y={6} width={19} height={8} rx={2} fill="#E8AF73" />
      <Path d="M25 23v12m-6-6h12" />
    </IconFrame>
  )
}
