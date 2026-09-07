import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'
import { Button, LinkButton, LinkRow } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

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

  const message = notice ?? params.notice

  return (
    <Screen scroll>
      {/* The pair carries the welcome; it is dropped when something went wrong
          so the message and the action sit higher up the screen. */}
      {error || message ? null : (
        <Image
          source={require('../assets/art/welcome-pets.png')}
          style={styles.hero}
          resizeMode="contain"
          accessible={false}
        />
      )}

      <Text variant="h1" style={styles.title}>
        Вход
      </Text>

      {message ? <Banner text={message} /> : null}

      <Field
        label="Почта"
        value={email}
        onChangeText={setEmail}
        placeholder="anna@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        autoCapitalize="none"
      />

      {error ? <Banner text={error} tone="error" /> : null}

      <Button title="Войти" onPress={submit} busy={busy} />

      <View style={styles.links}>
        <LinkRow>
          <LinkButton title="Создать аккаунт" onPress={() => router.push('/sign-up')} />
          <LinkButton title="Забыли пароль?" onPress={() => router.push('/forgot-password')} />
        </LinkRow>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { width: 232, height: 232, alignSelf: 'center', marginTop: space.row },
  title: { marginBottom: space.block },
  links: { marginTop: 4 },
})
