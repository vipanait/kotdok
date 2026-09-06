import { NextRequest } from 'next/server'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-http'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  return handleSymptomCheckRequest(request)
}
