import { useState } from 'react'
import { Button, TextInput, StyleSheet } from 'react-native'
import { Link, Redirect, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Message, Screen } from '@/ui/Screen'

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
      // The provider's reason is shown rather than swallowed: a wrong password
      // and an unconfirmed address need different actions from the user.
      setError(cause instanceof Error ? cause.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Вход">
      {(notice ?? params.notice) ? <Message text={(notice ?? params.notice)!} tone="info" /> : null}
      <TextInput
        style={styles.input}
        placeholder="Почта"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Message text={error} /> : null}
      <Button title={busy ? 'Входим…' : 'Войти'} onPress={submit} disabled={busy} />
      <Link href="/sign-up">Создать аккаунт</Link>
      <Link href="/forgot-password">Забыли пароль?</Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
})
