import { useState } from 'react'
import { Button, StyleSheet, TextInput } from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Message, Screen } from '@/ui/Screen'

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
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить письмо')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Восстановление пароля">
      {sent ? <Message text="Если такая почта зарегистрирована, письмо отправлено." tone="info" /> : null}
      <TextInput
        style={styles.input}
        placeholder="Почта"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {error ? <Message text={error} /> : null}
      <Button title={busy ? 'Отправляем…' : 'Отправить ссылку'} onPress={submit} disabled={busy} />
      <Link href="/sign-in">Назад ко входу</Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
})
