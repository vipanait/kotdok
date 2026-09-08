import { useState } from 'react'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { AuthShell, authFieldSpacing } from '@/features/auth/AuthShell'
import { ProviderButtons } from '@/features/auth/ProviderButtons'
import { Button, LinkButton, LinkRow } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'

export default function SignIn() {
  const { session, signIn, notice, dismissNotice } = useAuth()
  const params = useLocalSearchParams<{ notice?: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
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
      setError(errorMessage(cause, 'Не удалось войти'))
    } finally {
      setBusy(false)
    }
  }

  const message = notice ?? params.notice

  return (
    <AuthShell title="Вход">
      {message ? <Banner text={message} /> : null}

      <Field
        label="Почта"
        value={email}
        onChangeText={setEmail}
        placeholder="anna@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={authFieldSpacing}
      />
      <Field
        label="Пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        autoCapitalize="none"
        style={authFieldSpacing}
      />

      {error ? <Banner text={error} tone="error" /> : null}

      <Button title="Войти" onPress={submit} busy={busy} />

      <LinkRow>
        <LinkButton title="Создать аккаунт" onPress={() => router.push('/sign-up')} />
        <LinkButton title="Забыли пароль?" onPress={() => router.push('/forgot-password')} />
      </LinkRow>

      <ProviderButtons />
    </AuthShell>
  )
}
