import { useState } from 'react'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { useText } from '@/i18n'
import { AuthShell, authFieldSpacing } from '@/features/auth/AuthShell'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'

/** Reached only through a recovery link, which has already made a session. */
export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const t = useText()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error: cause } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (cause) {
      setError(errorMessage(t, cause, t.errors.savePasswordFailed))
      return
    }
    router.replace('/pets')
  }

  return (
    <AuthShell title={t.auth.newPasswordTitle}>
      <Field
        label={t.auth.newPassword}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        autoCapitalize="none"
        style={authFieldSpacing}
      />

      {error ? <Banner text={error} tone="error" /> : null}

      <Button title={t.common.save} onPress={submit} busy={busy} />
    </AuthShell>
  )
}
