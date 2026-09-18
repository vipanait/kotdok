import { StyleSheet } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useText } from '@/i18n'
import { Text } from '@/ui/Text'

/**
 * Where the terms live.
 *
 * Always the production site, whichever API this build talks to: the terms are
 * one public document, and a staging copy of it is not the one being accepted.
 * The site's own sign-in links to the same page.
 */
export const TERMS_URL = 'https://lapka.my/legal'

/**
 * «Продолжая, вы принимаете Пользовательское соглашение», under the ways in.
 *
 * A line rather than a checkbox: every button on the screen — the form and the
 * three providers — creates or opens an account, and the note covers all of
 * them without a fifth control to tick first.
 */
export function LegalNote() {
  const t = useText()

  return (
    <Text variant="caption" tone="faint" center style={styles.note}>
      {t.auth.legalPrefix}{' '}
      <Text
        variant="caption"
        tone="accent"
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
        style={styles.link}
      >
        {t.auth.legalLink}
      </Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  note: { marginTop: 16 },
  link: { textDecorationLine: 'underline' },
})
