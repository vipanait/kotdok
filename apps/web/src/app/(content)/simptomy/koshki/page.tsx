import type { Metadata } from 'next'
import { defaultOgImages } from '@/shared/site-metadata'
import SpeciesHub from '@/features/seo-content/components/SpeciesHub'

export const metadata: Metadata = {
  title: 'Симптомы у кошек: когда срочно к врачу',
  description: 'Рвота, понос, кошка не ест, не может пописать, тяжело дышит и другие симптомы: когда ехать в клинику сразу, когда в течение суток, а когда можно наблюдать.',
  alternates: { canonical: '/simptomy/koshki' },
  openGraph: { url: '/simptomy/koshki', images: defaultOgImages },
}

export default function CatSymptoms() {
  return <SpeciesHub species="cat" />
}
