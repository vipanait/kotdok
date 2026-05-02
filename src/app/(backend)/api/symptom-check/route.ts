import { NextRequest } from 'next/server'
import { handleSymptomCheckRequest } from '@/server/symptom-check/symptom-check-service'

export async function POST(request: NextRequest) {
  return handleSymptomCheckRequest(request)
}
