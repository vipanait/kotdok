import type { Metadata } from 'next'
import { publicPageMetadata } from '@/shared/site-metadata'
import LandingContent from '@/components/LandingContent'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { isSignedIn } from '@/server/auth/signed-in'

export const metadata: Metadata = publicPageMetadata({
  path: '/',
  title: 'Экстренная проверка симптомов кошки',
  description:
    'Когда с питомцем что-то не так, важно быстро понять, насколько срочная ситуация. Короткий опрос подскажет, нужно ли наблюдать, записаться к врачу или действовать срочно.',
})

export default async function Home() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)

  // Only for the header's button and the call to action: the token in the
  // cookie says enough, without a second trip to Auth after the proxy's.
  const signedIn = await isSignedIn()

  return <LandingContent signedIn={signedIn} dict={dict} />
}
