import { useState } from 'react'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import {
  providerNoticeFor,
  type ProviderNotice,
} from '@/features/auth/provider-notice'
import { errorMessage } from '@/lib/errors'
import { useText } from '@/i18n'
import { AuthShell, authFieldSpacing, authSubmitSpacing } from '@/features/auth/AuthShell'
import { ProviderButtons } from '@/features/auth/ProviderButtons'
import { ArrivalSkeleton } from '@/features/auth/ArrivalSkeleton'
import { LegalNote } from '@/features/auth/LegalNote'
import { credentialsProblem } from '@/features/auth/credentials'
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
  // Back from a provider with an answer: the form is done with, whatever the
  // outcome turns out to be, until a failure brings it back with its banner.
  const [entering, setEntering] = useState(false)
  const [busy, setBusy] = useState(false)

  // The list's outline under the redirect, not an empty frame: this screen is
  // what shows while registration slides away on top of it.
  if (session)
    return (
      <>
        <ArrivalSkeleton />
        <Redirect href="/pets" />
      </>
    )

  async function submit() {
    dismissNotice()
    const problem = credentialsProblem(t, { kind: 'sign-in', email, password })
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    setError(null)
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

  if (entering) return <ArrivalSkeleton />

  return (
    <AuthShell title={t.auth.signInTitle}>
      {message ? <Banner text={message} /> : null}

      <Field
        label={t.auth.email}
        value={email}
        onChangeText={(value) => {
          // The complaint was about what was there before; keeping it on screen
          // while it is being fixed reads as the fix being wrong too.
          setEmail(value)
          setError(null)
        }}
        placeholder={t.auth.emailPlaceholder}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={authFieldSpacing}
      />
      <Field
        label={t.auth.password}
        value={password}
        onChangeText={(value) => {
          setPassword(value)
          setError(null)
        }}
        secureTextEntry
        autoComplete="password"
        autoCapitalize="none"
        style={authSubmitSpacing}
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

      <ProviderButtons
        onReturn={() => setEntering(true)}
        onOutcome={(outcome) => {
          // A session leaves through the redirect above; showing the form again
          // first would be the flash this state exists to hide.
          if (outcome.kind !== 'session') setEntering(false)
          setProviderNotice(providerNoticeFor(outcome))
        }}
      />
      <LegalNote />
    </AuthShell>
  )
}
