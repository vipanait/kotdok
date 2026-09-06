import { HealthSchema } from '@lapka/contracts'
import { apiSuccess, newRequestId } from '@/server/api/response'

/**
 * Public liveness probe. It says the process is answering and nothing else:
 * detailed database readiness belongs to infrastructure checks, not to a route
 * anyone on the internet can call.
 */
export async function GET() {
  return apiSuccess(newRequestId(), HealthSchema.parse({ status: 'ok' }))
}
