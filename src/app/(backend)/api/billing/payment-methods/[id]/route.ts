import { billingDisabledResponse } from '@/server/billing/billing-disabled'

export async function DELETE() {
  return billingDisabledResponse()
}
