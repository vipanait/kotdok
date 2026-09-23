import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as sweep } from '@/app/(backend)/api/cron/photo-uploads/route'

let previousSecret: string | undefined

beforeAll(() => {
  previousSecret = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'test-cron-secret'
})

afterAll(() => {
  process.env.CRON_SECRET = previousSecret
})

describe('GET /api/cron/photo-uploads', () => {
  it('refuses a caller without the cron secret', async () => {
    const response = await sweep(new NextRequest('http://test.local/api/cron/photo-uploads'))
    expect(response.status).toBe(401)
  })

  it('answers with a count and nothing else', async () => {
    const response = await sweep(
      new NextRequest('http://test.local/api/cron/photo-uploads', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    )
    expect(response.status).toBe(200)
    expect(Object.keys(await response.json())).toEqual(['removed'])
  })
})
