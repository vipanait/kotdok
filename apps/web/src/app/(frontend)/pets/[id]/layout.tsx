import { headers } from 'next/headers'
import { openPetPage } from '@/components/cabinet/open-pet-page'
import { PAGE_PATH_HEADER, petReturnPath } from '@/server/security/page-path'

/**
 * The gate of every page of one pet — the record, its sections and records,
 * the form, the summary for the vet. It runs above the skeleton
 * (`(pet)/loading.tsx`): nothing streams until the pet is known to be the
 * caller's, so someone else's pet, a deleted one and a malformed id answer
 * with the HTTP status 404 (a streamed page is committed to 200, see Next's
 * streaming guide, «The HTTP contract»). The skeleton shows once this check
 * is through.
 *
 * The pages that decide a 404 of their own from what is inside the pet — a
 * record (`health/[recordId]`), the check of a visit written from a result
 * (`health/new?check=`) — are outside the `(pet)` group, with no skeleton
 * above them, so their notFound() is an HTTP 404 too (MW-09); they draw
 * their own loading state once their data is being read.
 *
 * Sign-in and consent bring the visitor back to the page asked for — the
 * proxy passes its path (`PAGE_PATH_HEADER`), taken only when it is a page
 * of this pet (`petReturnPath`) — and to the pet's record otherwise.
 */
export default async function PetLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await openPetPage(id, petReturnPath(id, (await headers()).get(PAGE_PATH_HEADER)))
  return children
}
