import { NextRequest } from 'next/server'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-http'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

/**
 * An analysis runs inside the request: up to two attempts at the model of a
 * minute each (`OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`), the photos and the
 * database around them. The budget is said here so the platform never ends
 * the function in the middle — that is the one case where a spent credit is
 * not given back.
 */
export const maxDuration = 180

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  return handleSymptomCheckRequest(request)
}
