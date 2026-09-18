/**
 * Where to send someone after signing in.
 *
 * The destination arrives in a `next` parameter that anyone can put in a link,
 * so it is checked in one place, shared by the server callback and the browser
 * form: a check that exists twice is a check that drifts apart, and the half
 * that drifts is an open redirect off a real sign-in.
 */

/** Stands in for this site while a destination is resolved. Never navigated to. */
const OWN_ORIGIN = 'https://lapka.invalid'

export const DEFAULT_NEXT_PATH = '/dashboard'

/**
 * @returns a path on this site: either `next` itself, or the dashboard when it
 *   points anywhere else.
 */
export function getSafeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/')) return DEFAULT_NEXT_PATH

  // Whether a destination stays on this site is the browser's reading of it,
  // not ours: it takes `\` for `/` and drops tabs and newlines, so `/\evil.com`
  // leaves for evil.com while looking like a path. Resolve it the same way and
  // keep it only if it landed back here.
  let resolved: URL
  try {
    resolved = new URL(next, OWN_ORIGIN)
  } catch {
    return DEFAULT_NEXT_PATH
  }

  if (resolved.origin !== OWN_ORIGIN) return DEFAULT_NEXT_PATH
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
