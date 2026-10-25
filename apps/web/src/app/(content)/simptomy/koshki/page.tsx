import type { Metadata } from 'next'
import { publicPageMetadata } from '@/shared/site-metadata'
import SpeciesHub from '@/features/seo-content/components/SpeciesHub'

export const metadata: Metadata = publicPageMetadata({
  path: '/simptomy/koshki',
  title: 'Симптомы у кошек: когда срочно к врачу',
  description: 'Рвота, понос, кошка не ест, не может пописать, тяжело дышит и другие симптомы: когда ехать в клинику сразу, когда в течение суток, а когда можно наблюдать.',
})

export default function CatSymptoms() {
  return <SpeciesHub species="cat" />
}
