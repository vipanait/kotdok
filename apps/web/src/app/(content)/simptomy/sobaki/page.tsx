import type { Metadata } from 'next'
import { publicPageMetadata } from '@/shared/site-metadata'
import SpeciesHub from '@/features/seo-content/components/SpeciesHub'

export const metadata: Metadata = publicPageMetadata({
  path: '/simptomy/sobaki',
  title: 'Симптомы у собак: когда срочно к врачу',
  description: 'Рвота, понос, собака не ест, вздулся живот, хромает, тяжело дышит и другие симптомы: когда ехать в клинику сразу, когда в течение суток, а когда можно наблюдать.',
})

export default function DogSymptoms() {
  return <SpeciesHub species="dog" />
}
