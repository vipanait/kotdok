import { z } from 'zod'
import { API_VERSION } from './version'
import { ApiErrorEnvelopeSchema, ERROR_STATUS, type ErrorCode } from './errors'
import { ProfileUpdateInputSchema, PublicProfileSchema } from './profile'
import { PetCreateInputSchema, PetSchema, PetUpdateInputSchema } from './pet'
import { CheckHistoryPageSchema, SymptomCheckRecordSchema } from './check'
import { ExtraCheckRequestStatusSchema, FeedbackInputSchema } from './credits'
import {
  CheckCreateInputSchema,
  CheckJobAcceptedSchema,
  CheckJobStatusSchema,
  IDEMPOTENCY_KEY_HEADER,
  UploadGrantSchema,
  UploadRequestSchema,
} from './analysis'
import {
  AccountDeletionAcceptedSchema,
  AccountDeletionRequestSchema,
  AccountDeletionStatusSchema,
  DELETION_RECEIPT_HEADER,
  HealthSchema,
} from './deletion'

/**
 * The OpenAPI document is built from the same schemas the runtime validates
 * with, so `docs/api/openapi.yaml` cannot describe a shape the code does not
 * enforce. Regenerating it must produce no diff — see scripts/check-openapi.ts.
 */

const registry = z.registry<{ id: string }>()

const COMPONENTS: Array<[string, z.ZodType]> = [
  ['ApiError', ApiErrorEnvelopeSchema],
  ['PublicProfile', PublicProfileSchema],
  ['ProfileUpdateInput', ProfileUpdateInputSchema],
  ['Pet', PetSchema],
  ['PetCreateInput', PetCreateInputSchema],
  ['PetUpdateInput', PetUpdateInputSchema],
  ['SymptomCheckRecord', SymptomCheckRecordSchema],
  ['CheckHistoryPage', CheckHistoryPageSchema],
  ['CheckCreateInput', CheckCreateInputSchema],
  ['CheckJobAccepted', CheckJobAcceptedSchema],
  ['CheckJobStatus', CheckJobStatusSchema],
  ['UploadRequest', UploadRequestSchema],
  ['UploadGrant', UploadGrantSchema],
  ['ExtraCheckRequestStatus', ExtraCheckRequestStatusSchema],
  ['FeedbackInput', FeedbackInputSchema],
  ['AccountDeletionRequest', AccountDeletionRequestSchema],
  ['AccountDeletionAccepted', AccountDeletionAcceptedSchema],
  ['AccountDeletionStatus', AccountDeletionStatusSchema],
  ['Health', HealthSchema],
]

for (const [id, schema] of COMPONENTS) registry.add(schema, { id })

function componentSchemas(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(registry, {
    target: 'draft-2020-12',
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, Record<string, unknown>> }

  // OpenAPI 3.1 carries the dialect on the document, not on each schema.
  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => {
      const { $schema: _dialect, $id: _id, ...rest } = schema
      return [id, rest]
    }),
  )
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

function errorResponse(code: ErrorCode, description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: ref('ApiError'),
        example: {
          error: { code, message: description, request_id: '01J000000000000000000000' },
        },
      },
    },
  }
}

/** Errors every authenticated route can return, so they are never forgotten. */
function commonErrors(...extra: ErrorCode[]): Record<string, unknown> {
  const codes: ErrorCode[] = [
    'unauthorized',
    'account_deleting',
    'rate_limited',
    'internal_error',
    ...extra,
  ]
  const descriptions: Record<ErrorCode, string> = {
    bad_request: 'Request body or query is invalid',
    unauthorized: 'Missing, malformed, expired or foreign access token',
    forbidden: 'Authenticated but not allowed to perform this operation',
    not_found: 'No such resource for this user',
    conflict: 'Same idempotency key with different data',
    insufficient_credits: 'No checks left on the balance',
    payload_too_large: 'Upload exceeds the published size limit',
    unsupported_media_type: 'File format is not accepted',
    rate_limited: 'Too many requests',
    account_deleting: 'Account is being deleted',
    dependency_unavailable: 'A dependency is temporarily unavailable',
    internal_error: 'Unexpected server error',
  }

  return Object.fromEntries(
    codes.map((code) => [String(ERROR_STATUS[code]), errorResponse(code, descriptions[code])]),
  )
}

function json(name: string, description: string) {
  return { description, content: { 'application/json': { schema: ref(name) } } }
}

function body(name: string, required = true) {
  return { required, content: { 'application/json': { schema: ref(name) } } }
}

const bearer = [{ bearerAuth: [] }]

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
}

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Лапка API',
      version: '1.0.0',
      description:
        'Mobile-facing API. Dates are UTC ISO 8601. Clients branch on error codes, ' +
        'never on message text. Private responses are never shared in a CDN cache.',
    },
    servers: [{ url: `/api/${API_VERSION}` }],
    security: bearer,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Supabase access token. Cookies are not accepted on v1 routes, and a ' +
            'malformed Bearer never falls back to cookie authentication.',
        },
      },
      schemas: componentSchemas(),
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness probe',
          security: [],
          responses: {
            '200': json('Health', 'Service is reachable'),
            '503': errorResponse('dependency_unavailable', 'Service is not ready'),
          },
        },
      },
      '/me': {
        get: {
          summary: 'Own profile, locale, balance and capabilities',
          responses: { '200': json('PublicProfile', 'Current profile'), ...commonErrors() },
        },
        patch: {
          summary: 'Change the allowed profile fields',
          requestBody: body('ProfileUpdateInput'),
          responses: {
            '200': json('PublicProfile', 'Updated profile'),
            ...commonErrors('bad_request'),
          },
        },
      },
      '/pets': {
        get: {
          summary: 'Own pets',
          responses: {
            '200': {
              description: 'Pets belonging to the caller',
              content: {
                'application/json': { schema: { type: 'array', items: ref('Pet') } },
              },
            },
            ...commonErrors(),
          },
        },
        post: {
          summary: 'Create a pet',
          requestBody: body('PetCreateInput'),
          responses: { '201': json('Pet', 'Created pet'), ...commonErrors('bad_request') },
        },
      },
      '/pets/{id}': {
        parameters: [idParam],
        get: {
          summary: 'One own pet',
          responses: { '200': json('Pet', 'The pet'), ...commonErrors('not_found') },
        },
        patch: {
          summary: 'Change a pet',
          requestBody: body('PetUpdateInput'),
          responses: {
            '200': json('Pet', 'Updated pet'),
            ...commonErrors('bad_request', 'not_found'),
          },
        },
        delete: {
          summary: 'Soft-delete a pet and hide its checks',
          responses: { '204': { description: 'Deleted' }, ...commonErrors('not_found') },
        },
      },
      '/uploads': {
        post: {
          summary: 'Scoped permission to upload photos to private storage',
          requestBody: body('UploadRequest'),
          responses: {
            '201': json('UploadGrant', 'One grant per requested file'),
            ...commonErrors('bad_request', 'payload_too_large', 'unsupported_media_type'),
          },
        },
      },
      '/checks': {
        get: {
          summary: 'History, newest first, cursor paginated',
          parameters: [
            {
              name: 'pet_id',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
            { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': json('CheckHistoryPage', 'One page of history'),
            ...commonErrors('bad_request'),
          },
        },
        post: {
          summary: 'Queue an analysis',
          description:
            'Returns a job, not a result. Repeating the request with the same ' +
            'idempotency key and the same data returns the original job; changing ' +
            'the data returns 409.',
          parameters: [
            {
              name: IDEMPOTENCY_KEY_HEADER,
              in: 'header',
              required: true,
              schema: { type: 'string', minLength: 8, maxLength: 200 },
            },
          ],
          requestBody: body('CheckCreateInput'),
          responses: {
            '202': json('CheckJobAccepted', 'Job accepted'),
            ...commonErrors(
              'bad_request',
              'conflict',
              'insufficient_credits',
              'not_found',
              'payload_too_large',
              'unsupported_media_type',
              'dependency_unavailable',
            ),
          },
        },
      },
      '/checks/{id}': {
        parameters: [idParam],
        get: {
          summary: 'A stored result, including checks made before v1',
          responses: {
            '200': json('SymptomCheckRecord', 'The stored result'),
            ...commonErrors('not_found'),
          },
        },
      },
      '/check-jobs/{job_id}': {
        parameters: [{ ...idParam, name: 'job_id' }],
        get: {
          summary: 'Job state, and the check id once it succeeded',
          responses: {
            '200': json('CheckJobStatus', 'Job state'),
            ...commonErrors('not_found'),
          },
        },
      },
      '/credits/extra-request': {
        get: {
          summary: 'Status of the extra free check request',
          responses: {
            '200': json('ExtraCheckRequestStatus', 'Current status'),
            ...commonErrors(),
          },
        },
        post: {
          summary: 'Ask for one extra free check',
          description: 'Repeating the request does not create a second pending row.',
          responses: {
            '200': json('ExtraCheckRequestStatus', 'Status after the request'),
            ...commonErrors('conflict'),
          },
        },
      },
      '/feedback': {
        post: {
          summary: 'Send feedback',
          requestBody: body('FeedbackInput'),
          responses: {
            '204': { description: 'Stored' },
            ...commonErrors('bad_request'),
          },
        },
      },
      '/account-deletion': {
        post: {
          summary: 'Request account deletion after a fresh identity check',
          description:
            'Accepting the request is not the same as finishing it. The client ' +
            'keeps the receipt secret so it can poll status after its session is gone.',
          requestBody: body('AccountDeletionRequest'),
          responses: {
            '202': json('AccountDeletionAccepted', 'Request accepted'),
            ...commonErrors('bad_request', 'forbidden'),
          },
        },
      },
      '/account-deletion/status': {
        get: {
          summary: 'Deletion status by receipt, without access to the profile',
          description:
            'Authenticated by the receipt secret alone; the response carries no ' +
            'email, user id or data, and is served with Cache-Control: no-store.',
          security: [],
          parameters: [
            {
              name: DELETION_RECEIPT_HEADER,
              in: 'header',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            },
          ],
          responses: {
            '200': json('AccountDeletionStatus', 'Minimal status'),
            '404': errorResponse('not_found', 'Unknown or expired receipt'),
            '429': errorResponse('rate_limited', 'Too many requests'),
          },
        },
      },
    },
  }
}
