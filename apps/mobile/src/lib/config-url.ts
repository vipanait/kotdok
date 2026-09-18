/**
 * Checking an address the app was built with.
 *
 * `EXPO_PUBLIC_*` values are baked into the bundle, so a wrong one is not a
 * setting somebody can correct later — it is what every install does until the
 * next build. The one that matters is the scheme: every request to the API and
 * to Supabase carries the session's bearer token, and over plain http that
 * token travels in the open for anyone on the same network to take.
 *
 * Development is the exception, and only there: the phone talks to a laptop on
 * the LAN, which has no certificate.
 */
export function configuredUrl(
  name: string,
  value: string | undefined,
  options: { release: boolean },
): string {
  if (!value) throw new Error(`${name} is not set; check the app's .env`)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`)
  }

  if (options.release && url.protocol !== 'https:') {
    throw new Error(`${name} must use https in a release build, not ${url.protocol}`)
  }

  return value
}
