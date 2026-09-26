export type WebProvider = 'yandex' | 'google' | 'apple'

const EVERY_PROVIDER: WebProvider[] = ['yandex', 'google', 'apple']

/**
 * The providers the site offers for a sign-in headed to `next` (already checked).
 *
 * Google and Apple are hidden on the site; the app keeps them. The one
 * exception is the way to account deletion: somebody who signed up in the app
 * with Apple or Google has no other way to sign in here, and the deletion page
 * has to work without installing the app (Google Play's requirement).
 */
export function webProviders(next: string): WebProvider[] {
  const path = next.split(/[?#]/, 1)[0]
  return path === '/account-deletion' ? EVERY_PROVIDER : ['yandex']
}
