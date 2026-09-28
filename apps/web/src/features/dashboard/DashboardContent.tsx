import Link from 'next/link'
import CabinetShell from '@/components/cabinet/CabinetShell'
import HistoryRows from '@/components/cabinet/HistoryRows'
import Icon from '@/components/ui/Icon'
import { creditsState } from '@/features/credits/credits-state'
import MyPetsSection from '@/features/dashboard/MyPetsSection'
import PetSavedBanner from '@/features/pets/PetSavedBanner'
import type { PetSavedKind } from '@/features/pets/pet-saved'
import PetsEmptyCard from '@/features/pets/PetsEmptyCard'
import type { CabinetUser } from '@/server/cabinet/load-cabinet'
import type { DashboardData } from '@/server/dashboard/load-dashboard'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getTimeZone } from '@/server/i18n/get-time-zone'

interface Props {
  cabinet: CabinetUser
  data: DashboardData
  petSaved: PetSavedKind | null
  /** The owner's calendar day, for the pets' due lines. */
  today: string
}

/**
 * The overview: the next step, then the first pets beside the newest results.
 * Its height does not grow with the number of pets — the full list is one
 * link away. With no checks left the next step is getting one, not a symptom
 * form the owner cannot send.
 */
export default async function DashboardContent({ cabinet, data, petSaved, today }: Props) {
  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()])
  const dict = await getDictionary(locale)
  const t = dict.dashboard

  const { pets, checks, latestChecksByPet, dueByPet, latestRequestStatus } = data
  const state = creditsState(cabinet.credits, latestRequestStatus)

  const recentChecks = (
    <section className="card recent-checks" aria-labelledby="recent-checks-title">
      <div className="section-head section-head-action">
        <h2 id="recent-checks-title">{t.recentChecks}</h2>
        {checks.length > 0 && (
          <Link href="/checks" className="link">
            {t.allHistory}
            <Icon name="arrow" />
          </Link>
        )}
      </div>
      {checks.length ? (
        <>
          <HistoryRows checks={checks} dict={dict} locale={locale} timeZone={timeZone} />
          <p className="footnote recent-checks-note">{t.recentChecksNote}</p>
        </>
      ) : (
        <p className="recent-empty">{t.recentEmpty}</p>
      )}
    </section>
  )

  return (
    <CabinetShell cabinet={cabinet} active="overview" crumb={dict.shell.account}>
      {petSaved && <PetSavedBanner kind={petSaved} dict={dict} canCheck={state === 'ready'} />}

      <div className="pagehead">
        <div>
          <h1>{t.pageTitle}</h1>
          <p>{t.pageSubtitle}</p>
        </div>
      </div>

      {!pets.length ? (
        <>
          {state !== 'ready' && (
            <div className="banner credits-banner">
              <span>{state === 'pending' ? t.pendingTitle : t.outTitle}</span>
              <Link href="/credits" className="link">
                {state === 'pending' ? t.pendingCta : t.outCta}
                <Icon name="arrow" />
              </Link>
            </div>
          )}
          <PetsEmptyCard dict={dict} />
          <div className="dashboard-after-empty">{recentChecks}</div>
        </>
      ) : (
        <>
          {state === 'ready' ? (
            <section className="welcome-panel" aria-labelledby="welcome-title">
              <div>
                <h2 id="welcome-title">{t.welcomeTitle}</h2>
                <p>{t.welcomeBody}</p>
              </div>
              <Link href="/check" className="btn primary">
                {t.welcomeCta}
                <Icon name="arrow" />
              </Link>
            </section>
          ) : (
            <section className="welcome-panel is-waiting" aria-labelledby="welcome-title">
              <div>
                <h2 id="welcome-title">{state === 'pending' ? t.pendingTitle : t.outTitle}</h2>
                <p>{state === 'pending' ? t.pendingBody : t.outBody}</p>
              </div>
              <Link href="/credits" className={state === 'pending' ? 'btn secondary' : 'btn primary'}>
                {state === 'pending' ? t.pendingCta : t.outCta}
                <Icon name="arrow" />
              </Link>
            </section>
          )}

          <div className="dashboard-columns">
            <MyPetsSection
              pets={pets}
              latestChecksByPet={latestChecksByPet}
              dueByPet={dueByPet}
              today={today}
              dict={dict}
              locale={locale}
            />
            {recentChecks}
          </div>
        </>
      )}
    </CabinetShell>
  )
}
