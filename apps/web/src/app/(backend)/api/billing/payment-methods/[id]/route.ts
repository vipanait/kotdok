import { NextRequest } from 'next/server'
import { billingDisabledResponse } from '@/server/billing/billing-disabled'
import { csrfForbiddenResponse, verifyCsrf } from '@/server/security/csrf'

export async function DELETE(request: NextRequest) {
  if (!await verifyCsrf(request)) return csrfForbiddenResponse()

  return billingDisabledResponse()
}
