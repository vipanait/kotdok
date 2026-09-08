import { useState } from 'react'
import { router } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { AuthShell, authFieldSpacing } from '@/features/auth/AuthShell'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
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
      setError(errorMessage(cause, 'Не удалось отправить письмо'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Восстановление пароля">
      {/* Deliberately says nothing about whether the address is registered. */}
      {sent ? (
        <Banner text="Если такая почта зарегистрирована, письмо отправлено." icon="mail" />
      ) : null}

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

      {error ? <Banner text={error} tone="error" /> : null}

      <Button title="Отправить ссылку" onPress={submit} busy={busy} />
      <LinkButton title="Назад ко входу" onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  )
}
