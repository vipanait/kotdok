import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PAGE_PATH_HEADER } from '@/server/security/page-path'

// The session is not what is tested here: a signed-in visitor, no network.
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } })),
}))

const { proxy } = await import('@/proxy')

const pet = 'cc4df1d5-35a2-45ae-9522-c85ffa50e6ff'

/** The request headers the proxy hands on to the page (Next carries them as `x-middleware-request-*`). */
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name.toLowerCase()}`)
}

describe('the page path the proxy hands to the pet gate (MW-09)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon'
  })

  it('is the page asked for, whatever a client sent under the same name', async () => {
    for (const spoofed of ['//evil.example/x', `/pets/00000000-0000-4000-8000-000000000000/edit`, 'https://evil.example/']) {
      const request = new NextRequest(`http://localhost:3100/pets/${pet}/edit?_rsc=abc`, { headers: { [PAGE_PATH_HEADER]: spoofed } })
      const response = await proxy(request)
      expect(forwarded(response, PAGE_PATH_HEADER), spoofed).toBe(`/pets/${pet}/edit`)
    }
  })

  it('is set on a request that sent none, with the query and without Next’s _rsc', async () => {
    const response = await proxy(new NextRequest(`http://localhost:3100/pets/${pet}/health/new?type=weight&from=form&_rsc=1`))
    expect(forwarded(response, PAGE_PATH_HEADER)).toBe(`/pets/${pet}/health/new?type=weight&from=form`)
  })
})
