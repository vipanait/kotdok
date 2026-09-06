import { NextRequest } from 'next/server'
import { billingDisabledResponse } from '@/server/billing/billing-disabled'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function POST(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  return billingDisabledResponse()
}
