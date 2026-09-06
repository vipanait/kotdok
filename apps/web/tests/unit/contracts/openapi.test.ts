import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { validate } from '@readme/openapi-parser'
import { buildOpenApiDocument } from '@lapka/contracts'

// docs/api/openapi.yaml is generated from the contract schemas, so the document
// cannot describe a shape the code does not enforce. Update it with:
//   npm run openapi:update --workspace @lapka/web
const DOCUMENT_PATH = '../../../../../docs/api/openapi.yaml'

const HEADER = [
  '# Generated from packages/contracts by `npm run openapi:update --workspace @lapka/web`.',
  '# Do not edit by hand: the test that writes it fails when the two disagree.',
  '',
].join('\n')

function render(): string {
  return HEADER + stringify(buildOpenApiDocument(), { lineWidth: 100 })
}

describe('OpenAPI document', () => {
  it('matches the committed docs/api/openapi.yaml', async () => {
    await expect(render()).toMatchFileSnapshot(DOCUMENT_PATH)
  })

  it('is accepted by an OpenAPI validator', async () => {
    const result = await validate(parse(render()))

    // The result is a discriminated union: errors only exist on the invalid arm,
    // so surface them before asserting rather than after.
    if (!result.valid) expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('describes every route the roadmap lists', () => {
    const document = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> }

    expect(Object.keys(document.paths).sort()).toEqual([
      '/account-deletion',
      '/account-deletion/status',
      '/check-jobs/{job_id}',
      '/checks',
      '/checks/{id}',
      '/credits/extra-request',
      '/feedback',
      '/health',
      '/me',
      '/pets',
      '/pets/{id}',
      '/uploads',
    ])
  })

  it('gives every operation security, a success response and its error responses', () => {
    const document = buildOpenApiDocument() as {
      security: unknown[]
      paths: Record<string, Record<string, { responses?: Record<string, unknown>; security?: unknown[] }>>
    }

    // Bearer by default; only the two deliberately public routes opt out.
    expect(document.security).toEqual([{ bearerAuth: [] }])

    const publicOperations: string[] = []

    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (method === 'parameters') continue

        const responses = operation.responses ?? {}
        const codes = Object.keys(responses)
        const success = codes.filter((code) => code.startsWith('2'))
        const failures = codes.filter((code) => !code.startsWith('2'))

        expect(success, `${method.toUpperCase()} ${path} has no success response`).not.toHaveLength(0)
        expect(failures, `${method.toUpperCase()} ${path} has no error responses`).not.toHaveLength(0)

        if (operation.security?.length === 0) publicOperations.push(`${method} ${path}`)
      }
    }

    expect(publicOperations.sort()).toEqual(['get /account-deletion/status', 'get /health'])
  })

  it('never exposes a private field through the profile schema', () => {
    const document = buildOpenApiDocument() as {
      components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean }> }
    }
    const profile = document.components.schemas.PublicProfile

    expect(Object.keys(profile.properties ?? {}).sort()).toEqual([
      'account_status',
      'capabilities',
      'credits',
      'id',
      'locale',
      'role',
    ])
    expect(profile.additionalProperties).toBe(false)
  })
})
