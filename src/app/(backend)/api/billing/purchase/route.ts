import { billingDisabledResponse } from '@/server/billing/billing-disabled'

export async function POST() {
  return billingDisabledResponse()
}
