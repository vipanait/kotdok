import { getSafeNextPath } from '@/shared/security/safe-next'

/**
 * The page a request asked for, as `src/proxy.ts` saw it (path and query).
 * A layout is not given the path of the page below it; the pet gate in
 * `pets/[id]/layout.tsx` needs it to bring the visitor back to that page
 * after sign-in or consent (MW-09), not to the pet's record.
 *
 * The proxy sets it on every page request, replacing anything a client sent
 * under the same name. It is an address to return to, never a reason to let
 * anyone in: whoever reads it still decides access by the session.
 */
export const PAGE_PATH_HEADER = 'x-lapka-page'

/** Next's own query parameter of a navigation's RSC request: not part of the page. */
const RSC_PARAMETER = '_rsc'

/** What the proxy puts in {@link PAGE_PATH_HEADER}: the path and query, without Next's `_rsc`. */
export function pagePathOf(url: URL): string {
  const params = new URLSearchParams(url.search)
  params.delete(RSC_PARAMETER)
  const query = params.toString()
  return `${url.pathname}${query ? `?${query}` : ''}`
}

/**
 * Where the gate of one pet sends the visitor back to: the page asked for,
 * when it is a page of this very pet — `/pets/<id>`, `/pets/<id>/…` or
 * `/pets/<id>?…` on this site — else the pet's record. Anything else in the
 * header (another pet, another site, `/\evil`, a path that only starts
 * like this pet's id) is not taken: no open redirect through it.
 */
export function petReturnPath(petId: string, asked: string | null): string {
  const record = `/pets/${petId}`
  if (!asked) return record
  const safe = getSafeNextPath(asked)
  if (safe !== asked) return record
  const rest = safe.slice(record.length)
  return safe.startsWith(record) && (rest === '' || rest.startsWith('/') || rest.startsWith('?')) ? safe : record
}
