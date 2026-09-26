'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import { AppleMark, GoogleMark, YandexMark } from '@/components/ui/ProviderMarks'
import { createClient } from '@/features/auth/lib/supabase-browser'
import type { WebProvider } from '@/features/auth/lib/web-providers'

type Provider = WebProvider

const SUPABASE_PROVIDER = {
  yandex: 'custom:yandex',
  google: 'google',
  apple: 'apple',
} as const

const MARK = {
  yandex: <YandexMark />,
  google: <GoogleMark />,
  apple: <AppleMark />,
}


interface Props {
  /** Which buttons to show; see `webProviders`. Decided on the server so both renders agree. */
  providers: Provider[]
  /** Where the callback sends the person once signed in; already checked. */
  next: () => string
  /**
   * Runs before a provider is opened; `false` stops it. Registration uses it
   * to require the consent, which applies to every provider as to email.
   */
  canStart?: () => boolean
  /**
   * Runs once `canStart` has agreed, right before leaving for the provider.
   * Registration uses it to carry the ticked consent to the callback.
   */
  beforeStart?: () => void
  /** Undoes `beforeStart` when the provider could not be opened. */
  onStartFailed?: () => void
  /** Called with '' when a provider starts, and with a message when it fails. */
  onError: (message: string) => void
}

/**
 * «или» and the sign-in providers under the login and registration
 * forms. Each button shows that it is waiting for its provider; the others are
 * held meanwhile so a second redirect cannot start.
 */
export default function ProviderButtons({ providers, next, canStart, beforeStart, onStartFailed, onError }: Props) {
  const dict = useTranslations()
  const t = dict.auth.providers
  const [pending, setPending] = useState<Provider | null>(null)

  // Back from the provider's page through the browser's history, the page can
  // come out of the back/forward cache still saying it is redirecting.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPending(null)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const errors: Record<Provider, string> = {
    yandex: t.errorYandex,
    google: t.errorGoogle,
    apple: t.errorApple,
  }

  async function start(provider: Provider) {
    if (canStart && !canStart()) return
    beforeStart?.()
    setPending(provider)
    onError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: SUPABASE_PROVIDER[provider],
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next())}` },
    })
    if (error) {
      onStartFailed?.()
      onError(errors[provider])
      setPending(null)
    }
  }

  return (
    <>
      <div className="or">{dict.common.or}</div>
      <div className="providers">
        {providers.map(provider => (
          <button
            key={provider}
            type="button"
            className={`provider ${provider}`}
            onClick={() => start(provider)}
            disabled={pending !== null}
            aria-busy={pending === provider || undefined}
          >
            {MARK[provider]}
            <span>{pending === provider ? dict.common.redirecting : t[provider]}</span>
          </button>
        ))}
      </div>
    </>
  )
}
