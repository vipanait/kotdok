import 'server-only'

import type { NextRequest, NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { UuidSchema } from '@lapka/contracts'
import { apiError } from '@/server/api/response'
import type { ApiContext } from '@/server/api/with-api-auth'

/**
 * Reading what a v1 request carries: the JSON body against its contract, and
 * the ids in its path. Every route answered these the same way by hand; here
 * the answer is written once, so no route can drift from it.
 */

/** The parsed value, or the response that refuses it. */
export type Read<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

/**
 * The body, parsed by the schema. Two refusals, both 400 and both as every
 * route has always worded them: a body that is not JSON, and one that is but
 * does not match the contract.
 */
export async function readJson<T>(request: NextRequest, schema: ZodType<T>, context: ApiContext): Promise<Read<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: apiError(context.requestId, 'bad_request', 'Body is not valid JSON') }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, response: apiError(context.requestId, 'bad_request', 'Body does not match the contract') }
  }
  return { ok: true, data: parsed.data }
}

/**
 * A path segment that must be a UUID: the refusal to return, or null when
 * the value is one (the shape of `requireAdmin`). A malformed id is answered
 * like a missing row, 404: whether some other user owns that row is not
 * something the caller gets to learn from the status code.
 */
export function readUuidParam(value: string, context: ApiContext): NextResponse | null {
  if (UuidSchema.safeParse(value).success) return null
  return apiError(context.requestId, 'not_found', 'No such resource')
}
