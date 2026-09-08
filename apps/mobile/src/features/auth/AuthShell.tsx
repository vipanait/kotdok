import type { ReactNode } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { Logo } from '@/ui/Logo'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * The frame the four sign-in screens share: the wordmark, the pair of animals,
 * a title, the form.
 *
 * The artwork stays put through every state of every one of them — including
 * the one where the form complains. A person who mistyped a password has not
 * stopped being welcome, and moving the welcome out from under them makes an
 * ordinary typo feel like a fault.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen scroll>
      <View style={styles.brand}>
        <Logo />
      </View>

      <Image
        source={require('../../../assets/art/welcome-pets.png')}
        style={styles.hero}
        resizeMode="contain"
        accessible={false}
      />

      <Text variant="h1" style={styles.title}>
        {title}
      </Text>

      {children}
    </Screen>
  )
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: 8, marginBottom: 8 },
  hero: { width: 232, height: 232, alignSelf: 'center', marginTop: 4, marginBottom: 8 },
  title: { marginBottom: space.block },
})
