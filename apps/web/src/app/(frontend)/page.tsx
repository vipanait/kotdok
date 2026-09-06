import type { Metadata } from 'next'
import LandingContent from '@/components/LandingContent'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { createClient } from '@/server/supabase/server'

export const metadata: Metadata = {
  title: 'Экстренная проверка симптомов кошки',
  description:
    'Когда с питомцем что-то не так, важно быстро понять, насколько срочная ситуация. Короткий опрос подскажет, нужно ли наблюдать, записаться к врачу или действовать срочно.',
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
}

export default async function Home() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingContent signedIn={!!user} dict={dict} />
}
