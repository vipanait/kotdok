import { describe, expect, it } from 'vitest'
import { configuredUrl } from './config-url'

describe('the addresses the app is built with', () => {
  it('accepts an https address', () => {
    expect(configuredUrl('EXPO_PUBLIC_API_URL', 'https://lapka.my', { release: true }))
      .toBe('https://lapka.my')
  })

  it('refuses a missing value', () => {
    expect(() => configuredUrl('EXPO_PUBLIC_API_URL', undefined, { release: false }))
      .toThrow(/EXPO_PUBLIC_API_URL/)
  })

  it('refuses plain http in a build that ships', () => {
    // Every request carries a bearer token. A release build pointed at http
    // hands that token to anyone on the same network, and nothing on the phone
    // would say so.
    expect(() => configuredUrl('EXPO_PUBLIC_API_URL', 'http://192.168.1.10:3000', { release: true }))
      .toThrow(/https/)
  })

  it('still allows http while developing', () => {
    // The phone talks to a laptop on the LAN during development.
    expect(configuredUrl('EXPO_PUBLIC_API_URL', 'http://192.168.1.10:3000', { release: false }))
      .toBe('http://192.168.1.10:3000')
  })

  it('refuses something that is not an address at all', () => {
    expect(() => configuredUrl('EXPO_PUBLIC_SUPABASE_URL', 'lapka.my', { release: true }))
      .toThrow(/EXPO_PUBLIC_SUPABASE_URL/)
  })
})
