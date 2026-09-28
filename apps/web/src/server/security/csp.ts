/**
 * What a page is allowed to load, and from where.
 *
 * The policy is built per request because of the nonce: scripts run only if
 * they carry the one random value this response was issued with, so a script
 * an attacker manages to inject into the page has nothing to present and never
 * executes. Next puts the nonce on its own scripts when it finds one here.
 *
 * No `'unsafe-inline'` for scripts, then — that word would let exactly the
 * injected script through and leave the rest as decoration.
 */
export function buildContentSecurityPolicy(options: {
  nonce: string
  supabaseOrigin: string
  dev: boolean
}): string {
  const { nonce, supabaseOrigin, dev } = options

  return [
    "default-src 'self'",
    // `strict-dynamic` lets a script this page trusted load the chunks it
    // needs, which is how the router works, without naming every URL.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Styles keep `'unsafe-inline'`: the inline style attributes React writes
    // carry no nonce, and a style cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    // The browser talks to this site and to Supabase — auth, the database, and
    // nothing else.
    `connect-src 'self' ${supabaseOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Production is HTTPS only. The local dev server is plain http on
    // localhost: Chrome leaves localhost alone, but WebKit (Safari, the iOS
    // Simulator) upgrades its styles, scripts and Supabase calls to https,
    // which nothing answers — the page came up unstyled and could not sign in.
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}
