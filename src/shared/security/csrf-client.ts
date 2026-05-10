export const CSRF_COOKIE_NAME = 'lapka_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'
export const CSRF_FIELD_NAME = 'csrf_token'

export function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''

  const cookie = document.cookie
    .split('; ')
    .find(part => part.startsWith(`${CSRF_COOKIE_NAME}=`))

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : ''
}

export function csrfHeaders(headers?: HeadersInit): HeadersInit {
  return {
    ...headers,
    [CSRF_HEADER_NAME]: getCsrfToken(),
  }
}
