import { useState } from 'react'
import { router } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { useText } from '@/i18n'
import { AuthShell, authFieldSpacing } from '@/features/auth/AuthShell'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const t = useText()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (cause) {
      setError(errorMessage(t, cause, t.errors.sendFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={t.auth.recoverTitle}>
      {/* Deliberately says nothing about whether the address is registered. */}
      {sent ? (
        <Banner text={t.auth.resetSent} icon="mail" />
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

      {error ? <Banner text={error} tone="error" /> : null}

      <Button title={t.auth.sendLink} onPress={submit} busy={busy} />
      <LinkButton title={t.auth.backToSignIn} onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  )
}
