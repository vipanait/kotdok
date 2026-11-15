import { Path } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** milk.svg: `moloko`. */
export function Milk({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Path fill="#FFFFFF" d="m15 7 17 0 7 9v28H13V16Z" />
      <Path fill="#DDEFEB" d="M13 23h26v14H13Z" />
      <Path d="M15 7v9h24M32 7v9" />
      <Path fill="#A9CDC6" d="M26 25s-5 5-5 7a5 5 0 0 0 10 0c0-2-5-7-5-7Z" />
    </IconFrame>
  )
}
