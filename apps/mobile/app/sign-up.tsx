import { useState } from 'react'
import { Button, StyleSheet, TextInput } from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Message, Screen } from '@/ui/Screen'

export default function SignUp() {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await signUp(email.trim(), password)
      // Registration is not a session: the address still has to be confirmed.
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось зарегистрироваться')
    } finally {
      setBusy(false)
    }
  }

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
