import { LocaleProvider } from '@/components/LocaleProvider'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { sliceOf, type SliceRoute } from '@/shared/i18n/slices'

/**
 * A route group's layout wraps its pages in this: the client components under
 * it get the group's slice of the dictionary over the core the root gave
 * (`shared/i18n/slices.ts`). A server component; the locale and the
 * dictionary are the same cached reads the pages make.
 */
export default async function DictionarySlice({ route, children }: { route: SliceRoute; children: React.ReactNode }) {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  return (
    <LocaleProvider locale={locale} dict={sliceOf(dict, route)}>
      {children}
    </LocaleProvider>
  )
}
