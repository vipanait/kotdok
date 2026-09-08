import { PixelRatio, Text as Native, StyleSheet, type TextProps, type TextStyle } from 'react-native'
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

/**
 * How far a control's own label may grow with the system font.
 *
 * Body text scales without limit, as it should. A button does not: its height
 * is fixed by the design, and at the largest accessibility size an unbounded
 * label turned the docked action into a third of the screen and pushed the
 * form it belonged to out of sight. Capping the label keeps both on screen —
 * the person who needs large text still gets it, and still gets the form.
 */
export const CONTROL_FONT_LIMIT = 1.5

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
  /**
   * React Native scales `fontSize` with the system setting and leaves a
   * `lineHeight` given as a number exactly where it was. The design gives both,
   * so at the largest accessibility size the glyphs grew inside a line box that
   * did not: "Symptom check" lost its descenders, "Pet" came out as a dash, and
   * a button label rendered as its first letter. The leading is scaled by hand,
   * by the same factor and under the same ceiling as the size it belongs to.
   */
  const scale = Math.min(
    PixelRatio.getFontScale(),
    rest.maxFontSizeMultiplier ?? Number.POSITIVE_INFINITY,
  )
  const { lineHeight, ...face } = type[variant]

  return (
    <Native
      style={[
        face as TextStyle,
        { lineHeight: lineHeight * scale },
        { color: tones[tone] },
        center ? styles.center : null,
        style,
      ]}
      {...rest}
    />
  )
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } })
