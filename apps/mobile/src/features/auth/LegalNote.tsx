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
export const POLICY_URL = 'https://lapka.my/legal/privacy'

/**
 * «Продолжая, вы принимаете Пользовательское соглашение и Политику…», under the
 * ways in.
 *
 * The terms are accepted by continuing — every button on the screen creates or
 * opens an account. Consent to personal data processing is a separate act
 * (152-FZ art. 9) and has its own box on registration and on the consent
 * screen; this line is not it.
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
      </Text>{' '}
      {t.auth.legalAnd}{' '}
      <Text
        variant="caption"
        tone="accent"
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(POLICY_URL)}
        style={styles.link}
      >
        {t.auth.policyLink}
      </Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  note: { marginTop: 16 },
  link: { textDecorationLine: 'underline' },
})
