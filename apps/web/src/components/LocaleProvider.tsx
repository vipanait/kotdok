'use client'

import { createContext, useContext, useMemo } from 'react'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Locale } from '@/shared/i18n/config'
import { mergeSlices } from '@/shared/i18n/slices'

interface LocaleContextValue {
  locale: Locale
  dict: Partial<Dictionary>
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * The texts the client components under it read. The root gives every page
 * the core; a layout nested in it adds its route's slice over what is
 * already there (`shared/i18n/slices.ts`), so a screen never carries texts
 * it does not use.
 */
export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Partial<Dictionary>
  children: React.ReactNode
}) {
  const parent = useContext(LocaleContext)
  const value = useMemo(() => ({ locale, dict: mergeSlices(parent?.dict ?? null, dict) }), [locale, dict, parent])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>')
  return ctx.locale
}

/**
 * Outside production, a namespace the route did not provide fails loudly,
 * with its name, instead of as «cannot read properties of undefined» deep
 * in a screen. In production the dictionary is what it is.
 */
function guarded(dict: Partial<Dictionary>): Dictionary {
  if (process.env.NODE_ENV === 'production') return dict as Dictionary
  return new Proxy(dict as Dictionary, {
    get(target, property, receiver) {
      if (typeof property === 'string' && !(property in target)) {
        throw new Error(`The dictionary namespace "${property}" is not provided on this route: add it to ROUTE_SLICES (shared/i18n/slices.ts)`)
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

export function useTranslations(): Dictionary {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useTranslations must be used inside <LocaleProvider>')
  return useMemo(() => guarded(ctx.dict), [ctx.dict])
}
