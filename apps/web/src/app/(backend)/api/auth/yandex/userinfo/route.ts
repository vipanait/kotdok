import { NextRequest } from 'next/server'
import { fetchYandexUserinfo } from '@/server/auth/yandex-userinfo'

/**
 * Proxy for Supabase custom OAuth userinfo.
 * Yandex returns `id` instead of OIDC `sub`, which causes "missing provider id".
 * Point the custom:yandex provider Userinfo URL here.
 */
export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  return fetchYandexUserinfo(authorization)
}
