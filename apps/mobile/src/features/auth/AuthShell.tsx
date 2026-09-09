import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { Logo } from '@/ui/Logo'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * The frame the four sign-in screens share: the wordmark, the promise under
 * it, a title, the form.
 *
 * The masthead is the same on every one of them — sign-in, registration,
 * recovery, a new password — and stays put through every state, including the
 * ones where the form complains or a letter has just been sent. A person who
 * mistyped a password has not stopped being welcome.
 *
 * The pair of animals that used to stand here is gone: the concept moved the
 * welcome into words, and kept the illustrations for the screens that are
 * empty rather than the ones that are asking for something.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useText()

  return (
    <Screen scroll>
      <View style={styles.masthead}>
        <Logo />
        <Text variant="tagline" tone="accent" center style={styles.tagline}>
          {t.auth.tagline}
        </Text>
      </View>

      <Text variant="h1" style={styles.title}>
        {title}
      </Text>

      {children}
    </Screen>
  )
}

/** Auth forms breathe a little tighter than the rest, to leave room below. */
export const authFieldSpacing = { marginBottom: 16 }

const styles = StyleSheet.create({
  masthead: {
    minHeight: 144,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  tagline: { maxWidth: 310 },
  title: { marginBottom: 16 },
})
