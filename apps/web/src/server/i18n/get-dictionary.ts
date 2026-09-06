import 'server-only'
import type { Locale } from '@/shared/i18n/config'

const dictionaries = {
  ru: () => import('@/shared/i18n/dictionaries/ru').then((m) => m.default),
  en: () => import('@/shared/i18n/dictionaries/en').then((m) => m.default),
}

export const getDictionary = async (locale: Locale) => dictionaries[locale]()
