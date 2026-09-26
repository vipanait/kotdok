import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '@/server/security/csp'

const options = { nonce: 'r4nd0m', supabaseOrigin: 'https://project.supabase.co', dev: false }

function directive(policy: string, name: string): string {
  return policy.split('; ').find(part => part.startsWith(`${name} `))!
}

describe('the content security policy', () => {
  it('lets only this page’s own scripts run', () => {
    const policy = buildContentSecurityPolicy(options)

    expect(directive(policy, 'script-src')).toContain("'nonce-r4nd0m'")
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'")
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-eval'")
  })

  it('closes the directives an injected page would reach for', () => {
    const policy = buildContentSecurityPolicy(options)

    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("form-action 'self'")
    // Clickjacking: the sign-in form must not be loadable inside someone
    // else's page, however convincing the frame around it looks.
    expect(policy).toContain("frame-ancestors 'none'")
  })

  it('allows the one host the browser really talks to', () => {
    const policy = buildContentSecurityPolicy(options)

    expect(directive(policy, 'connect-src')).toContain('https://project.supabase.co')
    expect(directive(policy, 'connect-src')).toContain("'self'")
  })

  it('allows React’s eval only while developing', () => {
    // React rebuilds server-side error stacks with `eval` in development. A
    // build that ships has no such need, and saying so there would undo the
    // point of the policy.
    expect(directive(buildContentSecurityPolicy({ ...options, dev: true }), 'script-src'))
      .toContain("'unsafe-eval'")
  })

  it('upgrades insecure requests in a build that ships, not on the local http dev server', () => {
    // WebKit upgrades http://localhost too, which left Safari with an unstyled, script-less page (MW-07).
    expect(buildContentSecurityPolicy(options).split('; ')).toContain('upgrade-insecure-requests')
    expect(buildContentSecurityPolicy({ ...options, dev: true })).not.toContain('upgrade-insecure-requests')
  })

  it('is a single line, as a header has to be', () => {
    const policy = buildContentSecurityPolicy(options)

    expect(policy).not.toContain('\n')
    expect(policy).not.toContain('  ')
  })
})
