import { useState } from 'react'
import { Redirect, router } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import {
  providerNoticeFor,
  type ProviderNotice,
} from '@/features/auth/provider-notice'
import { errorMessage } from '@/lib/errors'
import { useText } from '@/i18n'
import { AuthShell, authFieldSpacing } from '@/features/auth/AuthShell'
import { ProviderButtons } from '@/features/auth/ProviderButtons'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'

export default function SignUp() {
  const { session, signUp } = useAuth()
  const t = useText()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [providerNotice, setProviderNotice] = useState<ProviderNotice | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { confirmationRequired } = await signUp(email.trim(), password)
      // Only promise a letter when one is actually coming. With confirmation
      // switched off Supabase signs the user in here and the redirect below
      // takes over, so telling them to open a link would be a dead end.
      if (confirmationRequired) setSent(true)
    } catch (cause) {
      setError(errorMessage(t, cause, t.errors.signUpFailed))
    } finally {
      setBusy(false)
    }
  }

  // Registration signed us in: nothing left to do on this screen.
  if (session) return <Redirect href="/pets" />

  return (
    <AuthShell title={t.auth.signUpTitle}>
      {sent ? (
        <Banner
          text={t.auth.confirmSent}
          icon="mail"
        />
      ) : null}

      <Field
        label={t.auth.email}
        value={email}
        onChangeText={setEmail}
        placeholder={t.auth.emailPlaceholder}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={authFieldSpacing}
      />
      <Field
        label={t.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        autoCapitalize="none"
        style={authFieldSpacing}
      />

      {error ? <Banner text={error} tone="error" /> : null}

      <Button title={t.auth.signUp} onPress={submit} busy={busy} />
      <LinkButton title={t.auth.haveAccount} onPress={() => router.replace('/sign-in')} />

      {providerNotice ? (
        <Banner text={providerNotice.text} tone={providerNotice.tone} />
      ) : null}

      <ProviderButtons onOutcome={(outcome) => setProviderNotice(providerNoticeFor(outcome))} />
    </AuthShell>
  )
}
