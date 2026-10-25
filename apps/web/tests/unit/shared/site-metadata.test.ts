import { describe, expect, it } from 'vitest'
import { publicPageMetadata, siteMetadata } from '@/shared/site-metadata'

/**
 * The site's preview picture is no longer attached by Next itself (the root
 * layout lives in a route group), so metadata has to name it. A public page
 * that forgets does not fail to build; this is what notices.
 */
describe('public page metadata', () => {
  it('always carries the site’s preview pictures', () => {
    const page = publicPageMetadata({ path: '/x', title: 'X', description: 'Y' })
    expect(page.openGraph?.images).toEqual(siteMetadata.openGraph?.images)
    expect(page.twitter?.images).toEqual(siteMetadata.twitter?.images)
    expect(siteMetadata.openGraph?.images).toBeTruthy()
  })

  it('names no picture for a segment that draws its own, so the file wins', () => {
    const page = publicPageMetadata({ path: '/x', title: 'X', description: 'Y', picture: 'own' })
    expect(page.openGraph).not.toHaveProperty('images')
    expect(page.twitter).not.toHaveProperty('images')
  })

  it('sets canonical and Open Graph to the same path, and robots only when asked', () => {
    const page = publicPageMetadata({ path: '/simptomy', title: 'X', description: 'Y', type: 'article' })
    expect(page.alternates?.canonical).toBe('/simptomy')
    expect(page.openGraph).toMatchObject({ url: '/simptomy', type: 'article', title: 'X' })
    expect(page.robots).toBeUndefined()
    expect(publicPageMetadata({ path: '/d', title: 'X', description: 'Y', robots: { index: false } }).robots).toEqual({ index: false })
  })
})
