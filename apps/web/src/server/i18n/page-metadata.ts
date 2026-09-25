import 'server-only'

import type { Metadata } from 'next'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { getDictionary } from './get-dictionary'
import { getLocale } from './get-locale'

/**
 * `generateMetadata` for a signed-in page: its title in the visitor's
 * language, so tabs tell the cabinet's pages apart, and no indexing.
 */
export function privatePageMetadata(title: (dict: Dictionary) => string) {
  return async function generateMetadata(): Promise<Metadata> {
    const dict = await getDictionary(await getLocale())
    return { title: title(dict), robots: { index: false, follow: false } }
  }
}
