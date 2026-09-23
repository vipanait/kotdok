import Link from 'next/link'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import Icon from '@/components/ui/Icon'
import Illustration from '@/components/ui/Illustration'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

interface Props {
  /** Signed in: the header leads to the cabinet and the main action to a check. */
  signedIn: boolean
  dict: Dictionary
}

/** The public landing page at `/`. */
export default function LandingContent({ signedIn, dict }: Props) {
  const t = dict.home

  return (
    <>
      <PublicHeader dict={dict} account={signedIn ? 'cabinet' : 'sign-in'} />
      <main className="landing">
        <section className="hero">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1>
              {t.titleLine1}
              <br />
              {t.titleLine2} <span>{t.titleAccent}</span>
            </h1>
            <p>{t.description}</p>
            <div className="row">
              <Link className="btn primary" href={signedIn ? '/check' : '/register'}>
                {t.checkSymptoms}
                <Icon name="arrow" />
              </Link>
              <span className="small muted">{t.species}</span>
            </div>
            {/* New profiles start with 2 checks (profiles.credits default, 20260506000000). */}
            {!signedIn && <p className="hero-offer">{t.offer}</p>}
          </div>
          <div className="hero-art">
            <Illustration name="welcome-pets" size={420} />
            <div className="float-card row">
              <Icon name="heart" />
              <div>
                <strong>{t.sloganLine1}</strong>
                <p>{t.sloganLine2}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="landing-steps" aria-labelledby="how-title">
          <h2 id="how-title" className="sr-only">{t.stepsTitle}</h2>
          <ol className="grid3">
            {t.steps.map((step, i) => (
              <li key={step.title}>
                <div className="step-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="footnote">{t.disclaimer}</p>
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
