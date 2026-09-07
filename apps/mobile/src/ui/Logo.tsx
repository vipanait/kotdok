import { SvgXml } from 'react-native-svg'
import { LAPKA_LOGO_SVG } from './lapka-logo'

/** The wordmark. 150 × 56 in the original, so the height follows the width. */
export function Logo({ width = 128 }: { width?: number }) {
  return (
    <SvgXml
      xml={LAPKA_LOGO_SVG}
      width={width}
      height={Math.round((width * 56) / 150)}
      accessibilityLabel="Лапка"
    />
  )
}
