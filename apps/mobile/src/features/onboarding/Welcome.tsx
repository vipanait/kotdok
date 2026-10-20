import { useWindowDimensions, Image, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Logo } from '@/ui/Logo'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import { ChoiceRow } from './ChoiceRow'

/**
 * The first entry of someone with no pet (onboarding, design 20 October 2026):
 * two ways in and a way to just look around. Nothing is required here — both
 * ways stay open from the ordinary screens too.
 */
export function Welcome({ onCheck, onHealth, onSkip }: { onCheck: () => void; onHealth: () => void; onSkip: () => void }) {
  const t = useText()
  const words = t.onboarding
  // The picture gives ground first on a small screen: the choices are what it is for.
  const narrow = useWindowDimensions().width <= 360

  return (
    <View>
      <View style={styles.logo}>
        <Logo width={128} />
      </View>
      <Image
        source={require('../../../assets/art/welcome-pets.png')}
        style={[styles.art, narrow ? styles.artNarrow : null]}
        resizeMode="contain"
        accessible={false}
      />
      <Text variant="h1" center accessibilityRole="header" style={styles.title}>
        {words.title}
      </Text>
      <Text tone="muted" center style={styles.body}>
        {words.body}
      </Text>
      <ChoiceRow icon="checkup" title={words.check} body={words.checkBody} lead onPress={onCheck} />
      <ChoiceRow icon="calendar" title={words.health} body={words.healthBody} onPress={onHealth} />
      <LinkButton title={words.skip} onPress={onSkip} />
    </View>
  )
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', marginBottom: space.row },
  art: { width: 220, height: 220, alignSelf: 'center' },
  artNarrow: { width: 160, height: 160 },
  title: { marginTop: space.row, marginBottom: space.row },
  body: { alignSelf: 'center', maxWidth: 300, marginBottom: space.block },
})
