import { NextRequest } from 'next/server'
import { PublicProfileSchema, ProfileUpdateInputSchema } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { apiError, apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'
import type { AccountContext } from '@/server/auth/account-state'

/**
 * The public profile. Built field by field from the account context rather than
 * spread from a row, and parsed by the contract before it leaves — so a column
 * added to `profiles` later cannot silently start reaching clients.
 */
function publicProfile(account: AccountContext) {
  return PublicProfileSchema.parse({
    id: account.userId,
    locale: account.locale,
    role: account.role,
    credits: account.credits,
    account_status: account.status,
    capabilities: {
      // Purchases are switched off; the provider in the tree is a stub.
      billing: false,
      extra_check_request: true,
    },
  })
}

export const GET = withApiAuth((_request, context: ApiContext) =>
  apiSuccess(context.requestId, publicProfile(context.account)),
)

export const PATCH = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(context.requestId, 'bad_request', 'Body is not valid JSON')
  }

  const parsed = ProfileUpdateInputSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(context.requestId, 'bad_request', 'Body does not match the contract')
  }

  const { error } = await createServiceClient()
    .from('profiles')
    .update(parsed.data)
    .eq('id', context.account.userId)

  if (error) {
    console.error(`[${context.requestId}] profile update failed:`, error.message)
    return apiError(context.requestId, 'internal_error', 'Could not save the profile')
  }

  return apiSuccess(context.requestId, publicProfile({ ...context.account, ...parsed.data }))
})
