import type { ReactNode } from 'react'
import Svg, { G } from 'react-native-svg'

/**
 * The frame every «Можно ли» item picture shares, as its SVG file has it
 * (apps/web/public/images/safety): a 52 × 52 box, no fill unless a shape
 * says so, a thin rounded #4D6557 outline. The colours are the illustration's
 * own and stay so — a picture never takes the verdict's colour.
 */
export const OUTLINE = '#4D6557'

export type SafetyIconProps = { size: number }

export function IconFrame({ size, children }: SafetyIconProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 52 52">
      <G fill="none" stroke={OUTLINE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </G>
    </Svg>
  )
}
