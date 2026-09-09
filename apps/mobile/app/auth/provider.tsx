import { Redirect } from 'expo-router'

/**
 * Where the system browser lands after Google or Yandex — on Android only, and
 * only by accident.
 *
 * The sign-in itself is handled by `openAuthSessionAsync`, which hands the
 * returned address straight back to `createProviderSignIn`. This screen exists
 * because Android does not stop there: the manifest claims the `lapka` scheme
 * with no host filter, so the OS *also* delivers `lapka://auth/provider?code=…`
 * to the main activity as an ordinary link. The router then looks for a route
 * of that name, finds none, and shows "page not found".
 *
 * Which is what a person saw after signing in successfully: the account was
 * created, the session was stored, and the app sat on a dead end until it was
 * restarted. iOS never showed it — there the browser session consumes the
 * address and the OS never routes it.
 *
 * So the route does nothing at all, deliberately. It must not read the code:
 * the exchange is already under way elsewhere, and a second attempt would fail
 * on a code that has just been spent. It hands control back to the splash,
 * which waits for the stored session to be read and sends the person to their
 * pets or to the sign-in screen — where a failed sign-in shows its own banner.
 */
export default function ProviderReturn() {
  return <Redirect href="/" />
}
