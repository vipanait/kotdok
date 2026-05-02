import 'server-only'
import type { Locale } from './config'

const dictionaries = {
  ru: () => import('./dictionaries/ru').then((m) => m.default),
  en: () => import('./dictionaries/en').then((m) => m.default),
}

export const getDictionary = async (locale: Locale) => dictionaries[locale]()
