import { Text as Native, StyleSheet, type TextProps, type TextStyle } from 'react-native'
import { colour, type } from './theme'

/**
 * Text with the design's scale attached, so no screen picks a size by hand.
 *
 * The variants are the ones the concept actually uses; adding a size means
 * adding it to the theme first, which is the point.
 */
type Variant = keyof typeof type

const tones = {
  default: colour.text,
  muted: colour.muted,
  faint: colour.faint,
  accent: colour.accentText,
  danger: colour.danger,
  inverse: colour.surface,
} as const

export function Text({
  variant = 'body',
  tone = 'default',
  center,
  style,
  ...rest
}: TextProps & {
  variant?: Variant
  tone?: keyof typeof tones
  center?: boolean
}) {
  return (
    <Native
      style={[
        type[variant] as TextStyle,
        { color: tones[tone] },
        center ? styles.center : null,
        style,
      ]}
      {...rest}
    />
  )
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } })
