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
      '/auth/reauth',
      '/check-jobs/{job_id}',
      '/checks',
      '/checks/{id}',
      '/checks/{id}/feedback',
      '/consent',
      '/credits/extra-request',
      '/feedback',
      '/health',
      '/health/catalog',
      '/me',
      '/pets',
      '/pets/due',
      '/pets/{id}',
      '/pets/{id}/health',
      '/pets/{id}/health/events',
      '/pets/{id}/health/events/{event_id}',
      '/pets/{id}/health/items/{item_id}/complete',
      '/pets/{id}/health/items/{item_id}/medication',
      '/pets/{id}/health/medications',
      '/pets/{id}/health/medications/{medication_id}',
      '/pets/{id}/health/summary',
      '/pets/{id}/health/visits',
      '/pets/{id}/health/visits/{event_id}',
      '/pets/{id}/health/weights',
      '/pets/{id}/health/weights/{weight_id}',
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

  it('names every error code that shares a status, instead of the last one replacing the others', () => {
    type Media = { example?: { error: { code: string } }; examples?: Record<string, { value: { error: { code: string } } }> }
    type Response = { description: string; content: { 'application/json': Media } }
    const document = buildOpenApiDocument() as { paths: Record<string, Record<string, { responses?: Record<string, Response> }>> }
    const codesOf = (response: Response) => {
      const media = response.content['application/json']
      return media.examples ? Object.values(media.examples).map((entry) => entry.value.error.code) : [media.example!.error.code]
    }

    // A visit's change: the idempotency conflict and the visit that already happened.
    const visitConflict = document.paths['/pets/{id}/health/visits/{event_id}'].patch.responses!['409']
    expect(codesOf(visitConflict)).toEqual(['conflict', 'record_done'])
    expect(visitConflict.description).toContain('conflict')
    expect(visitConflict.description).toContain('record_done')

    // Every authenticated operation still says the account may be closing.
    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        const forbidden = operation.responses?.['403']
        if (forbidden) expect(codesOf(forbidden), `${method.toUpperCase()} ${path}`).toContain('account_deleting')
      }
    }
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
