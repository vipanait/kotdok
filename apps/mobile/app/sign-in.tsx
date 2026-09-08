import { useState } from 'react'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import {
  providerNoticeFor,
  type ProviderNotice,
} from '@/features/auth/provider-notice'
import { errorMessage } from '@/lib/errors'
import { useText } from '@/i18n'
import { AuthShell, authFieldSpacing } from '@/features/auth/AuthShell'
import { ProviderButtons } from '@/features/auth/ProviderButtons'
import { Button, LinkButton, LinkRow } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'

export default function SignIn() {
  const { session, signIn, notice, dismissNotice } = useAuth()
  const params = useLocalSearchParams<{ notice?: string }>()
  const t = useText()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [providerNotice, setProviderNotice] = useState<ProviderNotice | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Redirect href="/pets" />

  async function submit() {
    setBusy(true)
    setError(null)
    dismissNotice()
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      // The reason is kept rather than flattened: a wrong password and an
      // unconfirmed address need different actions from the user.
      setError(errorMessage(t, cause, t.errors.signInFailed))
    } finally {
      setBusy(false)
    }
  }

  const message = notice ?? params.notice

  return (
    <AuthShell title={t.auth.signInTitle}>
      {message ? <Banner text={message} /> : null}

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

      <Button title={t.auth.signIn} onPress={submit} busy={busy} />

      <LinkRow>
        <LinkButton title={t.auth.createAccount} onPress={() => router.push('/sign-up')} />
        <LinkButton title={t.auth.forgotPassword} onPress={() => router.push('/forgot-password')} />
      </LinkRow>

      {providerNotice ? (
        <Banner text={providerNotice.text} tone={providerNotice.tone} />
      ) : null}

      <ProviderButtons onOutcome={(outcome) => setProviderNotice(providerNoticeFor(outcome))} />
    </AuthShell>
  )
}
