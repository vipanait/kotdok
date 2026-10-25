import { describe, expect, it } from 'vitest'
import { allContent, typeset } from '@/features/seo-content/load'

const NBSP = ' '

describe('the typographer', () => {
  it('glues a short word to the next one, and leaves everything else alone', () => {
    expect(typeset('Кошка не ест и не пьёт')).toBe(`Кошка не${NBSP}ест и${NBSP}не${NBSP}пьёт`)
    expect(typeset('в клинику (в течение суток)')).toBe(`в${NBSP}клинику (в${NBSP}течение суток)`)
    expect(typeset('Рвота у кошки: когда срочно к врачу')).toBe(`Рвота у${NBSP}кошки: когда срочно к${NBSP}врачу`)
    expect(typeset('навсегда')).toBe('навсегда')
  })

  it('is applied to the prose of a page but not to what search engines show', () => {
    const page = allContent().symptoms[0]
    expect(page.metaTitle).not.toContain(NBSP)
    expect(page.metaDescription).not.toContain(NBSP)
    expect(page.slug).not.toContain(NBSP)
    expect(page.shortAnswer).toContain(NBSP)
  })
})
