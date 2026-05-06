import { NextResponse } from 'next/server'

export function billingDisabledResponse() {
  return NextResponse.json(
    { error: 'billing_disabled', message: 'Billing is temporarily disabled.' },
    { status: 503 },
  )
}
