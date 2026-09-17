import 'server-only'

/**
 * Mail domains whose mailboxes belong to the Yandex account itself.
 *
 * Signing in with Yandex proves ownership of such an address. Any other
 * address in a Yandex ID is only what the user typed as a contact, and Yandex
 * never says it checked it.
 */
const YANDEX_MAIL_DOMAINS = new Set(['yandex.ru', 'ya.ru', 'yandex.com', 'yandex.by', 'yandex.kz', 'yandex.ua'])

function isYandexMailbox(email: string): boolean {
  const at = email.lastIndexOf('@')
  return at > 0 && YANDEX_MAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase())
}

/**
 * Yandex returns `id` / `default_email`; Supabase custom OAuth requires `sub` / `email`.
 *
 * It also needs `email_verified`: Supabase treats an address without it as
 * unconfirmed, and that decides account linking. An unconfirmed Yandex address
 * never joins an existing account (a separate, empty one is created instead),
 * and when the same person later signs in with Apple or Google, Supabase
 * removes the unconfirmed Yandex identity from the account. Only Yandex's own
 * mailboxes are vouched for; see OPEN_QUESTIONS 2.14 and 1.19.
 */
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

  // Whatever the raw response says about verification is not ours to pass on.
  const rest = { ...raw }
  delete rest.email_verified

  return {
    ...rest,
    ...(id ? { sub: id, id } : {}),
    ...(email ? { email, email_verified: isYandexMailbox(email) } : {}),
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
