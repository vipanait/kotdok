'use client'

import { createContext, useContext } from 'react'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Locale } from '@/shared/i18n/config'

interface LocaleContextValue {
  locale: Locale
  dict: Dictionary
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Dictionary
  children: React.ReactNode
}) {
  return (
    <LocaleContext.Provider value={{ locale, dict }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>')
  return ctx.locale
}

export function useTranslations(): Dictionary {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useTranslations must be used inside <LocaleProvider>')
  return ctx.dict
}
