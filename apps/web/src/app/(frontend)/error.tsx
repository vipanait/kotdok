'use client' // Error boundaries must be Client Components

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from '@/components/LocaleProvider'
import PublicFooter from '@/components/site/PublicFooter'
import PublicHeader from '@/components/site/PublicHeader'
import Illustration from '@/components/ui/Illustration'
import { supportEmail } from '@/shared/seo'

/**
 * Whatever a page of the site throws while rendering. The root layout above
 * still stands, so the dictionary is at hand; who is signed in is not, so the
 * header offers no account button and the way out is the home page.
 */
export default function FrontendError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const dict = useTranslations()
  const t = dict.errors
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    console.error(error)
    headingRef.current?.focus()
  }, [error])

  return (
    <>
      <PublicHeader dict={dict} account="none" />
      <main className="reading error-page">
        <div className="empty">
          <Illustration name="welcome-pets" size={210} />
          <div className="eyebrow">{t.errorEyebrow}</div>
          <h1 ref={headingRef} tabIndex={-1}>{t.errorTitle}</h1>
          <p>
            {t.errorText}{' '}
            <a className="error-mail" href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </p>
          <div className="row error-actions">
            <button type="button" className="btn primary" onClick={() => retry()}>
              {t.retry}
            </button>
            <Link href="/" className="btn secondary">{t.toHome}</Link>
          </div>
          {error.digest && (
            <p className="footnote">{t.errorCode.replace('{code}', error.digest)}</p>
          )}
        </div>
      </main>
      <PublicFooter dict={dict} />
    </>
  )
}
