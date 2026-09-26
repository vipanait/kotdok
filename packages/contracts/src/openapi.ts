import { z } from 'zod'
import { API_VERSION } from './version'
import { ApiErrorEnvelopeSchema, ERROR_STATUS, type ErrorCode } from './errors'
import { ProfileUpdateInputSchema, PublicProfileSchema } from './profile'
import { PetCreateInputSchema, PetSchema, PetUpdateInputSchema } from './pet'
import {
  CompleteItemInputSchema,
  DueItemSchema,
  HealthProductSchema,
  MedicationPatchSchema,
  MedicationSchema,
  MedicationsInputSchema,
  VisitInputSchema,
  VisitPatchSchema,
  HealthEventInputSchema,
  HealthEventPatchSchema,
  HealthEventSchema,
  HealthOverviewSchema,
  WeightInputSchema,
  WeightMeasurementSchema,
  WeightPatchSchema,
} from './medical-record'
import { VetSummarySchema } from './vet-summary'
import { CheckHistoryPageSchema, SymptomCheckRecordSchema } from './check'
import { CheckFeedbackSchema, ExtraCheckRequestStatusSchema, FeedbackInputSchema } from './credits'
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
  ReauthProofSchema,
  ReauthRequestSchema,
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
  ['HealthOverview', HealthOverviewSchema],
  ['VetSummary', VetSummarySchema],
  ['WeightMeasurement', WeightMeasurementSchema],
  ['WeightInput', WeightInputSchema],
  ['WeightPatch', WeightPatchSchema],
  ['HealthEvent', HealthEventSchema],
  ['HealthEventInput', HealthEventInputSchema],
  ['HealthEventPatch', HealthEventPatchSchema],
  ['CompleteItemInput', CompleteItemInputSchema],
  ['DueItem', DueItemSchema],
  ['HealthProduct', HealthProductSchema],
  ['Medication', MedicationSchema],
  ['MedicationsInput', MedicationsInputSchema],
  ['MedicationPatch', MedicationPatchSchema],
  ['VisitInput', VisitInputSchema],
  ['VisitPatch', VisitPatchSchema],
  ['SymptomCheckRecord', SymptomCheckRecordSchema],
  ['CheckHistoryPage', CheckHistoryPageSchema],
  ['CheckCreateInput', CheckCreateInputSchema],
  ['CheckJobAccepted', CheckJobAcceptedSchema],
  ['CheckJobStatus', CheckJobStatusSchema],
  ['UploadRequest', UploadRequestSchema],
  ['UploadGrant', UploadGrantSchema],
  ['ExtraCheckRequestStatus', ExtraCheckRequestStatusSchema],
  ['FeedbackInput', FeedbackInputSchema],
  ['CheckFeedback', CheckFeedbackSchema],
  ['ReauthRequest', ReauthRequestSchema],
  ['ReauthProof', ReauthProofSchema],
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
    reauth_required: 'Signed in, but the last authentication is too old for this operation',
    account_deleting: 'Account is being deleted',
    record_done: 'The record is a done procedure, a visit that happened or a finished course: it can be read and deleted, not changed',
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

/** Optional here, unlike on /checks: a medical record repeats harmlessly without one, only less safely. */
const idempotencyParam = {
  name: IDEMPOTENCY_KEY_HEADER,
  in: 'header',
  required: false,
  schema: { type: 'string', minLength: 8, maxLength: 200 },
}

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
      '/auth/reauth': {
        post: {
          summary: 'Prove a fresh authentication before a sensitive operation',
          description:
            'Freshness is read from the access token\'s `amr` claim, which records when the ' +
            'person actually authenticated and does not move when the token is refreshed. The ' +
            'proof it returns is bound to one user and one operation, expires, and is spent once.',
          requestBody: body('ReauthRequest'),
          responses: {
            '200': json('ReauthProof', 'A proof, good once and not for long'),
            '401': errorResponse('reauth_required', 'The last authentication is too old'),
            ...commonErrors('bad_request'),
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
      '/pets/{id}/health': {
        parameters: [idParam],
        get: {
          summary: 'The pet\'s medical record: the pet form and the sections that accept records',
          responses: { '200': json('HealthOverview', 'The medical record'), ...commonErrors('not_found') },
        },
      },
      '/pets/{id}/health/summary': {
        parameters: [idParam],
        get: {
          summary: 'Everything to show a vet, the source of the «Для врача» screen and PDF',
          description:
            'Core vaccinations of the species are listed even with no record; null means not recorded, never «none». ' +
            'Visits of the last year, the five latest dated weights, current courses, the three latest checks. ' +
            '`today` is the owner\'s calendar day: it decides which courses are taken now and which visits fall in the last year. ' +
            'It is used only while it is today in some time zone; otherwise, or without it, the server\'s UTC day is used.',
          parameters: [
            { name: 'today', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          ],
          responses: { '200': json('VetSummary', 'The summary'), ...commonErrors('not_found') },
        },
      },
      '/pets/{id}/health/weights': {
        parameters: [idParam],
        post: {
          summary: 'Record a weighing; a second one for the same day replaces that day\'s value',
          description: 'The pet form\'s weight becomes the latest measurement. A day in the future is refused.',
          requestBody: body('WeightInput'),
          responses: {
            '201': json('WeightMeasurement', 'The day\'s measurement'),
            ...commonErrors('bad_request', 'not_found'),
          },
        },
      },
      '/pets/{id}/health/weights/{weight_id}': {
        parameters: [
          idParam,
          { name: 'weight_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        patch: {
          summary: 'Correct a measurement',
          requestBody: body('WeightPatch'),
          responses: {
            '200': json('WeightMeasurement', 'The corrected measurement'),
            ...commonErrors('bad_request', 'not_found', 'conflict'),
          },
        },
        delete: {
          summary: 'Delete a measurement; the form falls back to the one before it',
          responses: { '204': { description: 'Deleted' }, ...commonErrors('not_found') },
        },
      },
      '/health/catalog': {
        get: {
          summary: 'Vaccines or treatments for one species, popular first',
          description:
            'Search ignores case, «ё» and the keyboard layout. Only products a vet has checked are listed.',
          parameters: [
            { name: 'species', in: 'query', required: true, schema: { type: 'string', enum: ['cat', 'dog'] } },
            { name: 'kind', in: 'query', required: true, schema: { type: 'string', enum: ['vaccine', 'antiparasitic'] } },
            { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 100 } },
          ],
          responses: {
            '200': {
              description: 'Products',
              content: { 'application/json': { schema: { type: 'array', items: ref('HealthProduct') } } },
            },
            ...commonErrors('bad_request'),
          },
        },
      },
      '/pets/due': {
        get: {
          summary: 'Every due date of the caller\'s pets, soonest first',
          responses: {
            '200': {
              description: 'Planned items',
              content: { 'application/json': { schema: { type: 'array', items: ref('DueItem') } } },
            },
            ...commonErrors(),
          },
        },
      },
      '/pets/{id}/health/events': {
        parameters: [idParam],
        post: {
          summary: 'Record vaccinations done or planned; a done record also plans each item\'s next date',
          description:
            'A done record cannot be in the future; a plan and a next date cannot be in the past. ' +
            'The same Idempotency-Key with the same data returns the first record; with other data, 409.',
          parameters: [idempotencyParam],
          requestBody: body('HealthEventInput'),
          responses: {
            '201': json('HealthEvent', 'The record'),
            ...commonErrors('bad_request', 'not_found', 'conflict'),
          },
        },
      },
      '/pets/{id}/health/events/{event_id}': {
        parameters: [idParam, { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        patch: {
          summary: 'Correct or move a plan',
          description:
            'Only a planned record changes: a done one is history and answers 409 record_done ' +
            '(it can still be deleted). A plan keeps its id and its items; «Сделано» is ' +
            'POST /pets/{id}/health/items/{item_id}/complete.',
          requestBody: body('HealthEventPatch'),
          responses: {
            '200': json('HealthEvent', 'The plan'),
            ...commonErrors('bad_request', 'not_found', 'record_done'),
          },
        },
        delete: {
          summary: 'Delete a record or cancel a plan; plans made from it stay',
          responses: { '204': { description: 'Deleted' }, ...commonErrors('not_found') },
        },
      },
      '/pets/{id}/health/items/{item_id}/complete': {
        parameters: [idParam, { name: 'item_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        post: {
          summary: 'Mark one planned item done; others planned for the same day stay planned',
          parameters: [idempotencyParam],
          requestBody: body('CompleteItemInput'),
          responses: {
            '200': json('HealthEvent', 'The done record'),
            ...commonErrors('bad_request', 'not_found', 'conflict'),
          },
        },
      },
      '/pets/{id}/health/medications': {
        parameters: [idParam],
        post: {
          summary: 'Add medication courses; the pet form\'s medicines list follows',
          parameters: [idempotencyParam],
          requestBody: body('MedicationsInput'),
          responses: {
            '201': {
              description: 'The courses',
              content: { 'application/json': { schema: { type: 'array', items: ref('Medication') } } },
            },
            ...commonErrors('bad_request', 'not_found', 'conflict'),
          },
        },
      },
      '/pets/{id}/health/medications/{medication_id}': {
        parameters: [idParam, { name: 'medication_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        patch: {
          summary: 'Correct a course, or end it',
          description:
            'Only a current course changes: one that ended — its end is today or earlier in every ' +
            'time zone — is history and answers 409 record_done (it can still be deleted). A change ' +
            'that leaves a finished course as it is, such as «Завершить курс» sent again, answers 200.',
          requestBody: body('MedicationPatch'),
          responses: { '200': json('Medication', 'The course'), ...commonErrors('bad_request', 'not_found', 'record_done') },
        },
        delete: {
          summary: 'Delete a course',
          responses: { '204': { description: 'Deleted' }, ...commonErrors('not_found') },
        },
      },
      '/pets/{id}/health/visits': {
        parameters: [idParam],
        post: {
          summary: 'Record a vet visit that happened, with prescriptions, or plan one',
          description:
            'A prescription with add_to_medications starts a course from the visit\'s day. ' +
            'A planned visit takes no diagnosis or prescriptions. The check must be of this pet.',
          parameters: [idempotencyParam],
          requestBody: body('VisitInput'),
          responses: { '201': json('HealthEvent', 'The visit'), ...commonErrors('bad_request', 'not_found', 'conflict') },
        },
      },
      '/pets/{id}/health/visits/{event_id}': {
        parameters: [idParam, { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        patch: {
          summary: 'Change a planned visit, or mark it as having happened',
          description:
            'Only a planned visit changes: one that happened is history and answers 409 record_done ' +
            '(it can still be deleted, and a prescription of it still added to the medicines). ' +
            'Marking a plan done with status done may carry the diagnosis and prescriptions. ' +
            'The same key sent again with the same body changes nothing and answers 200, even once the visit is done; ' +
            'with another body it is a conflict.',
          parameters: [idempotencyParam],
          requestBody: body('VisitPatch'),
          responses: {
            '200': json('HealthEvent', 'The visit'),
            ...commonErrors('bad_request', 'not_found', 'conflict', 'record_done'),
          },
        },
      },
      '/pets/{id}/health/items/{item_id}/medication': {
        parameters: [idParam, { name: 'item_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        post: {
          summary: 'Start a course from a prescription; once',
          responses: {
            '201': {
              description: 'The course',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { medication_id: { type: 'string', format: 'uuid' } }, required: ['medication_id'] },
                },
              },
            },
            ...commonErrors('not_found'),
          },
        },
      },
      '/uploads': {
        post: {
          summary: 'Scoped permission to upload photos to private storage',
          description:
            'One grant per file. PUT the file to `url` with exactly `headers` before `expires_at`, ' +
            'then pass the `upload_id`s to POST /checks. A declared size over the limit is refused here; ' +
            'the real bytes are checked again when the check is created.',
          requestBody: body('UploadRequest'),
          responses: {
            '201': json('UploadGrant', 'One grant per requested file'),
            ...commonErrors('bad_request', 'dependency_unavailable'),
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
      '/checks/{id}/feedback': {
        parameters: [idParam],
        get: {
          summary: 'The opinion already given on this result, if any',
          responses: {
            '200': json('CheckFeedback', 'The rating, or null'),
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
          summary: 'Rate one result',
          description: 'A second opinion on the same check replaces the first.',
          requestBody: body('FeedbackInput'),
          responses: {
            '204': { description: 'Stored' },
            ...commonErrors('bad_request', 'not_found'),
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
            '401': errorResponse('reauth_required', 'No valid proof of fresh authentication'),
            ...commonErrors('bad_request', 'forbidden', 'not_found'),
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
