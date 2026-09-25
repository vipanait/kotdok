import 'server-only'

import { redirect } from 'next/navigation'
import { loadCabinetState, type CabinetUser } from '@/server/cabinet/load-cabinet'

/**
 * The frame data of a cabinet page, or a redirect: a signed-out visitor to
 * `signInHref`, an account being deleted to the deletion page — the sign-in
 * page would send its still-valid session straight back here.
 */
export async function requireCabinet(signInHref: string): Promise<CabinetUser> {
  const state = await loadCabinetState()
  if (state.kind === 'deleting') redirect('/account-deletion')
  if (state.kind === 'signed_out') redirect(signInHref)
  return state.cabinet
}
