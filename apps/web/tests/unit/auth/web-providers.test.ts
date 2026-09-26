import { describe, expect, it } from 'vitest'
import { webProviders } from '@/features/auth/lib/web-providers'

describe('providers offered on the site', () => {
  it('offers only Yandex ID for an ordinary sign-in', () => {
    expect(webProviders('/dashboard')).toEqual(['yandex'])
    expect(webProviders('/pets')).toEqual(['yandex'])
  })

  it('offers every provider on the way to account deletion', () => {
    // Somebody who signed up in the app with Apple or Google has no other way
    // to sign in on the site, and the deletion page must work without the app.
    expect(webProviders('/account-deletion')).toEqual(['yandex', 'google', 'apple'])
    expect(webProviders('/account-deletion?step=2')).toEqual(['yandex', 'google', 'apple'])
  })

  it('is not fooled by a path that only starts the same way', () => {
    expect(webProviders('/account-deletion-evil')).toEqual(['yandex'])
  })
})
