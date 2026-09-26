import { useState } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { Redirect, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { consentScreenDone, withFreshSession } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { useText } from '@/i18n'
import { LegalNote } from '@/features/auth/LegalNote'
import { ConsentCheckbox } from '@/features/consent/ConsentCheckbox'
import { consentSource } from '@/features/consent/consent-gate'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'

/**
 * Deleting the account without ever consenting: the public page, which every
 * provider can sign in to. Production site, like the terms.
 */
const ACCOUNT_DELETION_URL = 'https://lapka.my/account-deletion'

/**
 * The consent a new account still owes: signed up through a provider from the
 * sign-in screen, a hand-over that failed, or a new edition of the text.
 *
 * Outside the tabs, like deletion-status, so the tabs' own check cannot loop
 * back into itself. Leaving is always possible: signing out, or deleting the
 * account on the site without ever consenting.
 */
export default function Consent() {
  const t = useText()
  const { session, signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!checked) {
      setInvalid(true)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await withFreshSession((api) =>
        api.giveConsent({ version: PD_CONSENT_VERSION, source: consentSource(Platform.OS) }),
      )
      consentScreenDone()
      router.replace('/pets')
    } catch {
      setError(t.consent.errorFailed)
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    await signOut()
    router.replace('/sign-in')
  }

  // The session ended while this screen was open (an expired or revoked
  // token): nothing to consent for, and no tabs around to send anybody back.
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Screen
      title={t.consent.title}
      scroll
      dock={<Button title={t.consent.continue} onPress={submit} busy={busy} />}
    >
      <Text style={styles.lead}>{t.consent.lead}</Text>
      <ConsentCheckbox
        checked={checked}
        onChange={(value) => {
          setChecked(value)
          if (value) setInvalid(false)
        }}
        invalid={invalid}
      />
      {error ? <Banner text={error} tone="error" /> : null}
      <LegalNote />
      <LinkButton title={t.consent.signOut} onPress={() => void leave()} />
      <LinkButton
        title={t.consent.deleteAccount}
        onPress={() => void WebBrowser.openBrowserAsync(ACCOUNT_DELETION_URL)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  lead: { marginBottom: 16 },
})
