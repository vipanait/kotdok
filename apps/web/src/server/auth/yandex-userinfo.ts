import 'server-only'

/** Yandex returns `id` / `default_email`; Supabase custom OAuth requires `sub` / `email`. */
export function normalizeYandexUserinfo(raw: Record<string, unknown>): Record<string, unknown> {
  const id = raw.id != null ? String(raw.id) : undefined
  const emails = Array.isArray(raw.emails) ? raw.emails.filter((e): e is string => typeof e === 'string') : []
  const email =
    (typeof raw.default_email === 'string' && raw.default_email) ||
    emails[0] ||
    (typeof raw.email === 'string' ? raw.email : undefined)

  const name =
    (typeof raw.display_name === 'string' && raw.display_name) ||
    (typeof raw.real_name === 'string' && raw.real_name) ||
    (typeof raw.first_name === 'string' ? raw.first_name : undefined)

  return {
    ...raw,
    ...(id ? { sub: id, id } : {}),
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
  }
}

export async function fetchYandexUserinfo(authorization: string): Promise<Response> {
  const upstream = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: authorization },
    cache: 'no-store',
  })

  if (!upstream.ok) {
    const body = await upstream.text()
    return new Response(body || 'Yandex userinfo request failed', {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain' },
    })
  }

  const raw = (await upstream.json()) as Record<string, unknown>
  const normalized = normalizeYandexUserinfo(raw)

  if (!normalized.sub) {
    return Response.json({ error: 'Yandex userinfo missing id' }, { status: 502 })
  }

  return Response.json(normalized)
}
