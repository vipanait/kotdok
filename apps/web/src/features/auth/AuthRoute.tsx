import LapkaLogo from '@/components/LapkaLogo'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import Icon from '@/components/ui/Icon'
import AuthCard, { type AuthMode } from '@/features/auth/AuthCard'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'

type SearchParams = Record<string, string | string[] | undefined>

interface Props {
  mode: AuthMode
  searchParams: Promise<SearchParams>
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The page behind `/login`, `/register`, `/forgot-password` and
 * `/reset-password`: the brand's promise on the left, the form on the right.
 * No sign-in button in the header here, and no animals.
 */
export default async function AuthRoute({ mode, searchParams }: Props) {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const query = await searchParams
  const t = dict.auth.story

  // The auth callback lands on `/login?error=…` when the code is missing,
  // expired or refused, which includes a sign-in cancelled at the provider.
  const callbackFailed = mode === 'login' && first(query.error) !== undefined

  return (
    <>
      <PublicHeader dict={dict} account="none" />
      <main className="auth-wrap">
        <section className="auth-story">
          <LapkaLogo className="logo" />
          <h1>
            {t.titleLine1}
            <br />
            {t.titleLine2}
          </h1>
          <p>{t.text}</p>
          <ul className="auth-list">
            <li><Icon name="paw" />{t.benefitPet}</li>
            <li><Icon name="check" />{t.benefitUrgency}</li>
            <li><Icon name="history" />{t.benefitHistory}</li>
          </ul>
        </section>
        <AuthCard mode={mode} next={first(query.next)} callbackFailed={callbackFailed} />
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
