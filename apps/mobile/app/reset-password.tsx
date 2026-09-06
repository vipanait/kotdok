import { useState } from 'react'
import { Button, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Message, Screen } from '@/ui/Screen'

/** Reached only through a recovery link, which has already made a session. */
export default function ResetPassword() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error: cause } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (cause) {
      setError(cause.message)
      return
    }
    router.replace('/pets')
  }

  return (
    <Screen title="Новый пароль">
      <TextInput
        style={styles.input}
        placeholder="Новый пароль"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Message text={error} /> : null}
      <Button title={busy ? 'Сохраняем…' : 'Сохранить'} onPress={submit} disabled={busy} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
})
