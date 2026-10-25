import type { Metadata } from 'next'
import { defaultOgImages } from '@/shared/site-metadata'
import SpeciesHub from '@/features/seo-content/components/SpeciesHub'

export const metadata: Metadata = {
  title: 'Симптомы у собак: когда срочно к врачу',
  description: 'Рвота, понос, собака не ест, вздулся живот, хромает, тяжело дышит и другие симптомы: когда ехать в клинику сразу, когда в течение суток, а когда можно наблюдать.',
  alternates: { canonical: '/simptomy/sobaki' },
  openGraph: { url: '/simptomy/sobaki', images: defaultOgImages },
}

export default function DogSymptoms() {
  return <SpeciesHub species="dog" />
}
