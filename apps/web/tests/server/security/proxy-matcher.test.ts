import { describe, expect, it } from 'vitest'
import { config } from '@/proxy'

/**
 * The proxy verifies the session with Supabase on every request it matches
 * (a network round trip). Files that are the same for everybody must not
 * pay for that: the metadata routes, everything in `public/`, and the OAuth
 * return, which makes its own client. Pages do.
 */
function matched(path: string): boolean {
  return config.matcher.some(pattern => new RegExp(`^${pattern}$`).test(path))
}

describe('what the proxy matches', () => {
  it('skips the metadata routes and the files in public/', () => {
    for (const path of [
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.webmanifest',
      '/icon.svg',
      '/apple-icon.png',
      '/opengraph-image',
      '/opengraph-image-abc123.png',
      '/twitter-image',
      '/web-app-manifest-192x192.png',
      '/images/app-download/qr.png',
      '/yandex_10acef97a3f92788.html',
    ]) {
      expect(matched(path), path).toBe(false)
    }
  })

  it('skips the OAuth return, which handles its own session', () => {
    expect(matched('/auth/callback')).toBe(false)
  })

  it('still covers every page', () => {
    for (const path of ['/', '/legal', '/legal/privacy', '/login', '/register', '/dashboard', '/pets', '/pets/new', '/check', '/consent', '/admin/statistics', '/account-deletion', '/images', '/robots', '/icon.svg.bak']) {
      expect(matched(path), path).toBe(true)
    }
  })
})
