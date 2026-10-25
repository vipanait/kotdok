import { describe, expect, it } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-key-for-the-test'

const { createServiceClient } = await import('@/server/supabase/server')

describe('the service client', () => {
  it('is one client per process, not one per call', () => {
    expect(createServiceClient()).toBe(createServiceClient())
  })

  it('keeps no session and refreshes nothing: it acts with the service key alone', () => {
    const auth = createServiceClient().auth as unknown as { persistSession: boolean; autoRefreshToken: boolean }

    expect(auth.persistSession).toBe(false)
    expect(auth.autoRefreshToken).toBe(false)
  })
})
