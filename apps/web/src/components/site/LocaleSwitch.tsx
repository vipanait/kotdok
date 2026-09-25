'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { locales, type Locale } from '@/shared/i18n/config'

function rememberLocale(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; samesite=lax`
}

/**
 * RU / EN in the footer. The language lives in the `NEXT_LOCALE` cookie the
 * proxy already reads; switching rewrites it and re-renders on the server.
 */
export default function LocaleSwitch() {
  const router = useRouter()
  const current = useLocale()
  const dict = useTranslations()

  function choose(next: Locale) {
    if (next === current) return
    rememberLocale(next)
    router.refresh()
  }

  return (
    <span className="locale-switch" role="group" aria-label={dict.site.language}>
      {locales.map((locale, i) => (
        <span key={locale}>
          {i > 0 && <span aria-hidden> / </span>}
          <button
            type="button"
            lang={locale}
            aria-pressed={locale === current}
            onClick={() => choose(locale)}
          >
            {locale.toUpperCase()}
          </button>
        </span>
      ))}
    </span>
  )
}
