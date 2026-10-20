'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import welcomePets from '@/assets/illustrations/welcome-pets.png'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { updateOnboarding } from './onboarding-cookie'
import { chooseGoal, newPetHref, skipOnboarding, type OnboardingGoal } from './onboarding-state'

/**
 * «С чего начнём?» — the overview of a new account (design `welcome`). Both
 * paths start with the pet: a check is always about one. The choice is kept
 * for this account (onboarding-state.ts), so it goes on after a sign-in or
 * a reload; «Пока просто посмотрю» is said once and brings the ordinary
 * overview back. Nothing is required: the navigation stays as it is.
 */
export default function Welcome({ userId }: { userId: string }) {
  const t = useTranslations().onboarding
  const router = useRouter()

  const choose = (goal: OnboardingGoal) => () => updateOnboarding(userId, (state) => chooseGoal(state, goal))

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </div>

      <div className="welcome-start">
        <div className="welcome-start-art">
          <Image src={welcomePets} alt="" width={355} height={310} sizes="355px" priority className="art" />
          <p className="welcome-start-motto" aria-hidden>
            {t.artTitle}
          </p>
        </div>

        <div className="welcome-start-options">
          <section className="card welcome-option is-check" aria-labelledby="welcome-check-title">
            <h2 id="welcome-check-title">{t.checkTitle}</h2>
            <p>{t.checkBody}</p>
            <Link href={newPetHref('check')} className="btn primary" onClick={choose('check')}>
              {t.checkCta}
              <Icon name="arrow" />
            </Link>
          </section>

          <section className="card welcome-option" aria-labelledby="welcome-health-title">
            <h2 id="welcome-health-title">{t.healthTitle}</h2>
            <p>{t.healthBody}</p>
            <Link href={newPetHref('health')} className="btn secondary" onClick={choose('health')}>
              {t.healthCta}
            </Link>
          </section>

          <button
            type="button"
            className="link welcome-skip"
            onClick={() => {
              updateOnboarding(userId, skipOnboarding)
              router.refresh()
            }}
          >
            {t.skip}
          </button>
        </div>
      </div>
    </>
  )
}
