import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { loadCabinetState, type CabinetUser } from '@/server/cabinet/load-cabinet'

/**
 * Once per request: a pet page is gated by its layout and asks again in the
 * page (`openPetPage`), which must not read the session and account twice.
 */
const cabinetState = cache(loadCabinetState)

/**
 * The frame data of a cabinet page, or a redirect: a signed-out visitor to
 * `signInHref`, an account being deleted to the deletion page — the sign-in
 * page would send its still-valid session straight back here.
 */
export async function requireCabinet(signInHref: string): Promise<CabinetUser> {
  const state = await cabinetState()
  if (state.kind === 'deleting') redirect('/account-deletion')
  if (state.kind === 'signed_out') redirect(signInHref)
  return state.cabinet
}
