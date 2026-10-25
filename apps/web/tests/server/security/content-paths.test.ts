import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'
import { config } from '@/proxy'
import { CONTENT_SEGMENTS } from '@/shared/content-paths'

/**
 * The static articles skip the proxy and take their policy from next.config.
 * A matcher has to be a literal, so it repeats the list of segments; if the
 * two drift apart, an article either gets a nonce it cannot use (and stops
 * being static) or is served with no policy at all.
 */
function matched(path: string): boolean {
  return config.matcher.some(pattern => new RegExp(`^${pattern}$`).test(path))
}

describe('the article paths', () => {
  it('are left out of the proxy, and only they', () => {
    for (const segment of CONTENT_SEGMENTS) {
      expect(matched(`/${segment}`), segment).toBe(false)
      expect(matched(`/${segment}/rvota-u-koshki`), segment).toBe(false)
    }
    // A path that only starts with one of the words is the app's, like any other.
    for (const path of ['/', '/register', '/login', '/pets/new', '/check', '/legal', '/dashboard', '/simptomy-foo', '/otravlenie2']) {
      expect(matched(path), path).toBe(true)
    }
  })

  it('get the static policy from next.config, every one of them', async () => {
    const rules = await nextConfig.headers!()
    for (const segment of CONTENT_SEGMENTS) {
      for (const source of [`/${segment}`, `/${segment}/:path*`]) {
        const rule = rules.find(r => r.source === source)
        expect(rule?.headers.find(h => h.key === 'Content-Security-Policy')?.value, source).toContain("'unsafe-inline'")
      }
    }
  })
})
