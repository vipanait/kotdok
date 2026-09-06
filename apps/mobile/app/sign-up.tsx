import { useState } from 'react'
import { Button, StyleSheet, TextInput } from 'react-native'
import { Link, Redirect } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Message, Screen } from '@/ui/Screen'

export default function SignUp() {
  const { session, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
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
      setError(cause instanceof Error ? cause.message : 'Не удалось зарегистрироваться')
    } finally {
      setBusy(false)
    }
  }

  // Registration signed us in: nothing left to do on this screen.
  if (session) return <Redirect href="/pets" />

  return (
    <Screen title="Регистрация">
      {sent ? (
        <Message text="Отправили письмо. Откройте ссылку из него, чтобы подтвердить почту." tone="info" />
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Почта"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Message text={error} /> : null}
      <Button title={busy ? 'Отправляем…' : 'Зарегистрироваться'} onPress={submit} disabled={busy} />
      <Link href="/sign-in">Уже есть аккаунт</Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
})
