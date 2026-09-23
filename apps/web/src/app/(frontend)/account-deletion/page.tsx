import type { Metadata } from 'next'
import Link from 'next/link'
import { DELETION_COMPLETION_DAYS } from '@lapka/contracts'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import Icon from '@/components/ui/Icon'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { loadCabinetState } from '@/server/cabinet/load-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { formatCount } from '@/shared/i18n/plural'
import { supportEmail } from '@/shared/seo'
import DeleteAccountForm from './DeleteAccountForm'

export const metadata: Metadata = {
  title: 'Удаление аккаунта',
  description:
    'Как удалить аккаунт «Лапка» и данные, которые с ним связаны: что удаляется, что сохраняется и в какой срок. Запрос можно отправить с этой страницы, не устанавливая приложение.',
  alternates: { canonical: '/account-deletion' },
}

/**
 * The public page Google Play requires (stage 9/02).
 *
 * It has to be reachable and readable by somebody who has already deleted the
 * app, or never installed it — so everything that matters is on the page
 * itself, above any sign-in: what goes, what stays, how long it takes, and how
 * to reach a human. Only the button needs an account.
 *
 * Reading this page is not permission to delete anything. Ownership is proved
 * by signing in, and signing in is also what makes the authentication fresh
 * enough for the server to allow it.
 */
export default async function AccountDeletionPage() {
  const [locale, user] = await Promise.all([getLocale(), getAuthUser()])
  // Signed in but already being deleted: the cabinet is closed, so no links to it —
  // they would only bounce between the cabinet and sign-in.
  const cabinetOpen = user ? (await loadCabinetState()).kind === 'open' : false
  const dict = await getDictionary(locale)
  const t = dict.deletion
  const days = formatCount(t.timingDays, DELETION_COMPLETION_DAYS, locale)

  return (
    <>
      <PublicHeader dict={dict} account={cabinetOpen ? 'cabinet' : user ? 'none' : 'sign-in'} />
      <main className="reading deletion">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
        <p className="banner error">{t.irreversible}</p>

        <section aria-labelledby="deletion-goes">
          <h2 id="deletion-goes">{t.whatGoesTitle}</h2>
          <p>{t.whatGoes}</p>
        </section>

        <section aria-labelledby="deletion-stays">
          <h2 id="deletion-stays">{t.whatStaysTitle}</h2>
          <p>{t.whatStays}</p>
        </section>

        <section aria-labelledby="deletion-timing">
          <h2 id="deletion-timing">{t.timingTitle}</h2>
          <p>{t.timing.replace('{days}', days)}</p>
        </section>

        <section className="card" aria-labelledby="deletion-request">
          <h2 id="deletion-request">{t.requestTitle}</h2>
          {user ? (
            <DeleteAccountForm />
          ) : (
            <>
              <p>{t.signInText}</p>
              <Link href="/login?next=/account-deletion" className="btn primary">
                {t.signIn}
              </Link>
            </>
          )}
        </section>

        <p className="small deletion-support">
          {t.supportBefore}{' '}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          {t.supportAfter}
        </p>

        {cabinetOpen && (
          <Link href="/dashboard" className="link">
            <Icon name="back" />
            {t.backToAccount}
          </Link>
        )}
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
