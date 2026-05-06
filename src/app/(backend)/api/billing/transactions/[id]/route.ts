import { billingDisabledResponse } from '@/server/billing/billing-disabled'

export async function GET() {
  return billingDisabledResponse()
}
