import { Path } from 'react-native-svg'
import { IconFrame, type SafetyIconProps } from './frame'

/** household.svg: household substances. */
export function Household({ size }: SafetyIconProps) {
  return (
    <IconFrame size={size}>
      <Path fill="#DDEFEB" d="M19 21h13l6 16c1 5-2 7-6 7H18c-4 0-6-3-4-7Z" />
      <Path fill="#E8AF73" d="M19 8h17v6H25v7h-6Z" />
      <Path d="m30 15 5 7M20 32h12m-12 5h8M39 10h4m-3 6 3 2" />
    </IconFrame>
  )
}
