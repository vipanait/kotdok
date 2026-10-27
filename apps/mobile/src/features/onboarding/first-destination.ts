/**
 * Where the splash hands over once the stored session has been read.
 *
 * The intro — what the app is for, before it asks for anything — is shown
 * once per install, on the launch that has no session: the first-launch
 * marker (see `features/updates/first-launch`) is the whole memory of it. A
 * session wins even on a first launch, which iOS can produce after a
 * reinstall, since the keychain outlives the app there.
 */
export type FirstDestination = '/pets' | '/intro' | '/sign-in'

export function firstDestination({
  signedIn,
  firstLaunch,
}: {
  signedIn: boolean
  firstLaunch: boolean
}): FirstDestination {
  if (signedIn) return '/pets'
  return firstLaunch ? '/intro' : '/sign-in'
}
