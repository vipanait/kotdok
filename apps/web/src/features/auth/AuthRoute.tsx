import LandingContent from '@/components/LandingContent'
import AuthModal, { type AuthMode } from '@/features/auth/AuthModal'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { createClient } from '@/server/supabase/server'

interface Props {
  mode: AuthMode
}

/**
 * Server-rendered shell for `/login`, `/register`, `/forgot-password`,
 * `/reset-password`. Renders the same hero as the landing page in the
 * background and pops the auth modal on top in the requested mode.
 */
export default async function AuthRoute({ mode }: Props) {
  const locale = await getLocale()
  const dict = await getDictionary(locale)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <>
      <LandingContent signedIn={!!user} dict={dict} />
      <AuthModal initialMode={mode} />
    </>
  )
}
