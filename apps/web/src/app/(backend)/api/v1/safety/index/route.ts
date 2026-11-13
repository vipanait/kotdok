import { getSafetyIndex } from '@/server/safety/safety-service'
import { apiSuccess } from '@/server/api/response'
import { withApiAuth, type ApiContext } from '@/server/api/with-api-auth'

/** The «Можно ли» reference as a light list the phone searches, in the account's language. */
export const GET = withApiAuth(async (_request, context: ApiContext) =>
  apiSuccess(context.requestId, getSafetyIndex(context.account.locale)),
)
