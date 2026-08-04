import { describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  CSRF_COOKIE_NAME,
  CSRF_FIELD_NAME,
  CSRF_HEADER_NAME,
  ensureCsrfCookie,
  verifyCsrf,
} from '@/server/security/csrf'

const token = 'test-csrf-token'

function request(init: RequestInit = {}) {
  return new NextRequest('http://test.local/api/pets', {
    method: 'POST',
    ...init,
  })
}

function csrfHeaders(extra?: HeadersInit): HeadersInit {
  return {
    origin: 'http://test.local',
    cookie: `${CSRF_COOKIE_NAME}=${token}`,
    [CSRF_HEADER_NAME]: token,
    ...extra,
  }
}

describe('CSRF protection', () => {
  it('accepts a same-origin request with matching header and cookie tokens', async () => {
    await expect(verifyCsrf(request({ headers: csrfHeaders() }))).resolves.toBe(true)
  })

  it('rejects a request without a token', async () => {
    await expect(verifyCsrf(request())).resolves.toBe(false)
  })

  it('rejects a cross-origin request', async () => {
    await expect(verifyCsrf(request({
      headers: csrfHeaders({ origin: 'https://evil.example' }),
    }))).resolves.toBe(false)
  })

  it('accepts a matching form field token', async () => {
    const body = new URLSearchParams({ [CSRF_FIELD_NAME]: token })
    await expect(verifyCsrf(request({
      headers: {
        origin: 'http://test.local',
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    }))).resolves.toBe(true)
  })

  it('sets a token cookie when one is missing', () => {
    const req = request()
    const res = NextResponse.next()

    ensureCsrfCookie(req, res)

    expect(res.cookies.get(CSRF_COOKIE_NAME)?.value).toMatch(/^[a-f0-9]{64}$/)
  })
})
