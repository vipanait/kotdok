import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import ConsentForm from '@/features/consent/ConsentForm'
import { loadCabinetState } from '@/server/cabinet/load-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getSafeNextPath } from '@/shared/security/safe-next'

export const metadata: Metadata = {
  title: 'Согласие на обработку персональных данных',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Where a new account without consent is sent from the cabinet. Anyone who owes
 * nothing is sent on to where they were going.
 */
export default async function ConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams
  const raw = Array.isArray(query.next) ? query.next[0] : query.next
  const next = getSafeNextPath(raw ?? null)

  const state = await loadCabinetState()
  if (state.kind === 'signed_out') redirect(`/login?next=${encodeURIComponent('/consent')}`)
  if (state.kind === 'deleting') redirect('/account-deletion')
  if (state.kind === 'open') redirect(next)

  const dict = await getDictionary(await getLocale())

  return (
    <>
      <PublicHeader dict={dict} account="none" />
      <main className="auth-wrap">
        <ConsentForm next={next} />
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
