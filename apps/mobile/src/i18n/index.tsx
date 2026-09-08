import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SupportedLocale } from '@lapka/shared'
import { deviceLocale } from '@/lib/device-locale'
import { en } from './en'
import { ru, type Dictionary } from './ru'

const DICTIONARIES: Record<SupportedLocale, Dictionary> = { ru, en }

/** The words for one language, whichever language that is. */
export function dictionary(locale: SupportedLocale): Dictionary {
  return DICTIONARIES[locale]
}

type LocaleState = {
  locale: SupportedLocale
  t: Dictionary
  /** Called when the account's own choice becomes known, or changes. */
  setLocale: (locale: SupportedLocale) => void
}

const LocaleContext = createContext<LocaleState | null>(null)

/**
 * Which language the app speaks.
 *
 * Before anyone signs in there is no account to ask, so the device decides —
 * that is also the language the account will be created in. Once a profile is
 * loaded its own choice governs, because a person who set English on a Russian
 * phone meant it.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>(deviceLocale)

  const value = useMemo<LocaleState>(
    () => ({ locale, t: DICTIONARIES[locale], setLocale }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

function useLocaleState(): LocaleState {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useText used outside LocaleProvider')
  return value
}

/** The words for the current language. */
export function useText(): Dictionary {
  return useLocaleState().t
}

export function useLocale(): SupportedLocale {
  return useLocaleState().locale
}

export function useSetLocale(): (locale: SupportedLocale) => void {
  return useLocaleState().setLocale
}

export type { Dictionary }
