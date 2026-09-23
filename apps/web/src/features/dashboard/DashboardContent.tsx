import Link from 'next/link'
import CabinetShell from '@/components/cabinet/CabinetShell'
import HistoryRows from '@/components/cabinet/HistoryRows'
import Icon from '@/components/ui/Icon'
import Illustration from '@/components/ui/Illustration'
import { creditsState } from '@/features/credits/credits-state'
import MyPetsSection from '@/features/dashboard/MyPetsSection'
import { profileCompleteness } from '@/features/pets/pet-profile'
import PetSavedBanner, { type PetSavedKind } from '@/features/pets/PetSavedBanner'
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
}

/**
 * The overview: the next step, the pets, the newest results and a nudge to
 * fill profiles in. With no checks left the next step is getting one, not a
 * symptom form the owner cannot send.
 */
export default async function DashboardContent({ cabinet, data, petSaved }: Props) {
  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()])
  const dict = await getDictionary(locale)
  const t = dict.dashboard

  const { pets, checks, latestChecksByPet, latestRequestStatus } = data
  const state = creditsState(cabinet.credits, latestRequestStatus)

  // The context box points at the pet with the most left to fill in.
  const leastComplete = pets
    .map(pet => ({ pet, completeness: profileCompleteness(pet) }))
    .sort((a, b) => a.completeness - b.completeness)[0]
  const contextLink = !pets.length
    ? { href: '/pets/new', label: t.addPetBtn }
    : leastComplete && leastComplete.completeness < 100
      ? { href: `/pets/${leastComplete.pet.id}/edit`, label: t.contextCompleteProfile }
      : { href: '/pets', label: t.contextAllPets }

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

          <MyPetsSection
            pets={pets}
            latestChecksByPet={latestChecksByPet}
            dict={dict}
            locale={locale}
            timeZone={timeZone}
          />
        </>
      )}

      <div className="lower-grid">
        <section className="card" aria-labelledby="recent-checks-title">
          <div className="section-head section-head-action">
            <h2 id="recent-checks-title">{t.recentChecks}</h2>
            <Link href="/checks" className="link">
              {t.allHistory}
              <Icon name="arrow" />
            </Link>
          </div>
          {checks.length ? (
            <HistoryRows checks={checks} dict={dict} locale={locale} timeZone={timeZone} />
          ) : (
            <p className="recent-empty">{t.recentEmpty}</p>
          )}
        </section>

        <aside className="summary-box context-box">
          <h3>{t.contextTitle}</h3>
          <p>{t.contextBody}</p>
          <Link href={contextLink.href} className="link">{contextLink.label}</Link>
          <Illustration name="paw" size={130} />
        </aside>
      </div>
    </CabinetShell>
  )
}
