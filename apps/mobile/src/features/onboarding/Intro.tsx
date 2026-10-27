import { useWindowDimensions, Image, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Card } from '@/ui/Card'
import { Icon, type IconName } from '@/ui/Icon'
import { Logo } from '@/ui/Logo'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * The first launch, before sign-in: what the app is for, in three lines.
 *
 * Nobody reads the store listing, so the first screen says it instead — and
 * only says it. The rows are a telling, not a menu: every way in goes through
 * the sign-in the button under this opens, and the choice of a path waits for
 * the «С чего начнём?» screen after it. Shown once per install; the splash
 * decides when (see `first-destination`).
 */
export function Intro() {
  const t = useText()
  const words = t.intro
  // Same bargain as the welcome: on a small screen the picture gives ground.
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
      <FeatureRow icon="checkup" title={words.check} body={words.checkBody} />
      <FeatureRow icon="calendar" title={words.record} body={words.recordBody} />
      <FeatureRow icon="history" title={words.track} body={words.trackBody} />
    </View>
  )
}

/** One thing the app does: an outline icon, what it is, a line on what it gives. Not a button. */
function FeatureRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <Card outlined accessibilityLabel={`${title}. ${body}`} style={styles.row}>
      <Icon name={icon} color={colour.accentText} />
      <View style={styles.copy}>
        <Text variant="h3">{title}</Text>
        <Text variant="label" tone="muted">
          {body}
        </Text>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', marginBottom: space.row },
  art: { width: 220, height: 220, alignSelf: 'center' },
  artNarrow: { width: 160, height: 160 },
  title: { marginTop: space.row, marginBottom: space.row },
  body: { alignSelf: 'center', maxWidth: 300, marginBottom: space.block },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.row, marginBottom: space.row },
  copy: { flex: 1, minWidth: 0, gap: 4 },
})
