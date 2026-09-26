import 'server-only'

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { UuidSchema } from '@lapka/contracts'
import type { CabinetUser } from '@/server/cabinet/load-cabinet'
import { requireCabinet } from './require-cabinet'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getPet } from '@/server/pets/pet-service'
import { createServiceClient } from '@/server/supabase/server'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { Pet } from '@/shared/types'

/** Once per request: the layout of /pets/[id] and its page ask for the same pet. */
const readOwnPet = cache((userId: string, petId: string) => getPet(createServiceClient(), userId, petId))

/**
 * The gate of every medical record page (/pets/[id] and everything under
 * /pets/[id]/health): signed in, the pet is the caller's and live. Someone
 * else's pet, a deleted one and a malformed id are the same 404, answered
 * before anything of the record is drawn.
 *
 * The layout of /pets/[id] calls it first, above the segment's loading.tsx,
 * so the answer is decided before anything streams and a 404 goes out with
 * the HTTP status 404, not as a 200 page that says «not found» (MW-08). The
 * page calls it again for its data; the reads are made once per request.
 *
 * `path` is where sign-in brings the visitor back to.
 */
export async function openPetPage(
  petId: string,
  path: string,
): Promise<{ cabinet: CabinetUser; pet: Pet; dict: Dictionary }> {
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(path)}`)
  if (!UuidSchema.safeParse(petId).success) notFound()

  const [pet, locale] = await Promise.all([readOwnPet(cabinet.user.id, petId), getLocale()])
  if (!pet.ok) {
    if (pet.reason === 'not_found') notFound()
    if (pet.reason === 'account_deleting') redirect('/account-deletion')
    throw new Error(`Could not load the pet: ${pet.message ?? pet.reason}`)
  }

  return { cabinet, pet: pet.data, dict: await getDictionary(locale) }
}
