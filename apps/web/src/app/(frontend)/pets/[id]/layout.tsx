import { openPetPage } from '@/components/cabinet/open-pet-page'

/**
 * The gate of every page of one pet — the record, its sections and records,
 * the form, the summary for the vet. It runs above this segment's
 * loading.tsx: nothing streams until the pet is known to be the caller's, so
 * someone else's pet, a deleted one and a malformed id answer with the HTTP
 * status 404 (a streamed page is committed to 200, see Next's streaming guide,
 * «The HTTP contract»). The skeleton shows once this check is through.
 *
 * Sign-in brings the visitor back to the pet's record; the proxy already
 * sends a signed-out visitor to sign-in with the exact page before this runs.
 */
export default async function PetLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await openPetPage(id, `/pets/${id}`)
  return children
}
