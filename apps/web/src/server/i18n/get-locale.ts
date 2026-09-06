import 'server-only'
import { cookies } from 'next/headers'
import { defaultLocale, locales, type Locale } from '@/shared/i18n/config'

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const value = cookieStore.get('NEXT_LOCALE')?.value
  if (value && (locales as readonly string[]).includes(value)) return value as Locale
  return defaultLocale
}
