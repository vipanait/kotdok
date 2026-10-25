import { Image, StyleSheet, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * A check is about an animal, not about symptoms in the abstract.
 *
 * The analysis leans on species, age and chronic conditions; without a pet it
 * would answer in generalities and still cost a check from the balance. So
 * the form is not offered at all — the way out is to add the pet. The
 * content only: the screen around it is the check tab's own `Screen`.
 */
export function CheckNeedPet() {
  const t = useText()
  // The illustration is the first thing to give ground on a small screen: the
  // heading and the button below it are what the screen is for. 360 is the
  // width the concept's narrow artboard is drawn at.
  const narrow = useWindowDimensions().width <= 360
  return (
    <>
      {/* Decorative: the heading below already says what the screen is for,
          and a screen reader announcing two kittens helps nobody. */}
      <Image
        source={require('../../../assets/art/welcome-pets.png')}
        style={[styles.emptyArt, narrow ? styles.emptyArtNarrow : null]}
        resizeMode="contain"
        accessible={false}
      />
      <Text variant="h2" center style={styles.emptyTitle}>
        {t.check.needPetTitle}
      </Text>
      <Text tone="muted" center style={styles.emptyCopy}>
        {t.check.needPetBody}
      </Text>
      <Button title={t.pets.add} onPress={() => router.push('/check/new-pet')} />
    </>
  )
}

const styles = StyleSheet.create({
  // The pair stands rather than sits, so it needs the height; a narrow phone
  // gets the smaller one, which leaves the button above the fold.
  emptyArt: { width: 228, height: 228, alignSelf: 'center', marginBottom: 8 },
  emptyArtNarrow: { width: 160, height: 160 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },
})
