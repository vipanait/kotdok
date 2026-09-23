import Link from 'next/link'
import { redirect } from 'next/navigation'
import CabinetShell from '@/components/cabinet/CabinetShell'
import Icon from '@/components/ui/Icon'
import Illustration from '@/components/ui/Illustration'
import CreditsBalanceCard from '@/features/credits/CreditsBalanceCard'
import { loadCabinetUser } from '@/server/cabinet/load-cabinet'
import { readExtraCheckRequestStatus } from '@/server/extra-check/extra-check-service'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { privatePageMetadata } from '@/server/i18n/page-metadata'

export const generateMetadata = privatePageMetadata(d => d.credits.title)

/** «Доступные проверки»: the balance, and asking for an extra check when it runs out. */
export default async function CreditsPage() {
  const cabinet = await loadCabinetUser()
  if (!cabinet) redirect('/login?next=/credits')

  const [latestRequestStatus, locale] = await Promise.all([
    readExtraCheckRequestStatus(cabinet.user.id),
    getLocale(),
  ])
  const dict = await getDictionary(locale)
  const t = dict.credits

  return (
    <CabinetShell cabinet={cabinet} active="overview" crumb={`${dict.shell.account} / ${t.crumb}`}>
      <div className="pagehead">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </div>

      <div className="grid2">
        <CreditsBalanceCard credits={cabinet.credits} latestRequestStatus={latestRequestStatus} />

        <aside className="summary-box">
          <h3>{t.historyTitle}</h3>
          <p>{t.historyBody}</p>
          <Link href="/checks" className="link">
            {t.historyLink}
            <Icon name="arrow" />
          </Link>
          <Illustration name="paw" size={130} />
        </aside>
      </div>
    </CabinetShell>
  )
}
